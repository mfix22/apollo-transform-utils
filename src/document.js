const { parse, Kind, visit } = require('graphql')

const get = key => obj => {
  if (!key) return obj
  return key.split('.').reduce((accum, k) => (accum != null ? accum[k] : undefined), obj)
}

const __SELECTIONS__ = '__SELECTIONS__'
class DocumentTransformRequest {
  constructor(query) {
    this.document = typeof query === 'string' ? parse(query) : query
  }

  transformRequest(originalRequest) {
    if (this.document) {
      const operation = originalRequest.document.definitions.find(
        def => def.kind === Kind.OPERATION_DEFINITION
      )

      const newDocument = visit(this.document, {
        [Kind.SELECTION_SET](node) {
          if (node.selections.find(s => s.name && s.name.value === __SELECTIONS__)) {
            return Object.assign({}, node, {
              selections: node.selections
                .filter(s => s.name.value !== __SELECTIONS__)
                .concat(operation.selectionSet.selections)
            })
          }
        }
      })

      return Object.assign({}, originalRequest, {
        document: newDocument
      })
    }
    return originalRequest
  }
}

class DocumentTransformResult {
  constructor(query) {
    this.document = typeof query === 'string' ? parse(query) : query
    const fieldPath = []

    visit(this.document, {
      // eslint-disable-next-line
      [Kind.SELECTION_SET](node, key, parent) {
        if (parent.name) {
          fieldPath.push(parent.name.value)
        }

        if (node.selections.find(s => s.name && s.name.value === '__SELECTIONS__')) {
          return false
        }
      }
    })

    this.fieldPath = fieldPath
    this.get = get(`data.${this.fieldPath.join('.')}`)
  }

  transformResult(response){
    return {
      ...response,
      data: this.get(response)
    }
  }
}

class DocumentTransform {
  constructor(query) {
    this.request = new DocumentTransformRequest(query)
    this.result = new DocumentTransformResult(query)
  }
  transformRequest(...args) {
    return this.request.transformRequest(...args)
  }
  transformResult(...args) {
    return this.result.transformResult(...args)
  }
}
DocumentTransform.Request = DocumentTransformRequest
DocumentTransform.Result = DocumentTransformResult
DocumentTransform.__SELECTIONS__ = __SELECTIONS__

module.exports = DocumentTransform

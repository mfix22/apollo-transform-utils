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
      let newOperation = this.document.definitions.find(
        def => def.kind === Kind.OPERATION_DEFINITION
      )

      let existingVariables = [], varsToRename = [], variableCounter = 0, variablesNames = {};

      // generate new variable name same as Apollo's AddArgumentsAsVariables transform
      const generateVariableName = (name) => {
        let varName;
        do {
          varName = `_v${variableCounter}_${name}`;
          variableCounter++;
        } while (existingVariables.indexOf(varName) !== -1);
        return varName;
      };
      const getNewVariableName = (name) => {
        let newName = variablesNames[name]
        if (!newName) {
          newName = generateVariableName(name)
          variablesNames[name] = newName
          existingVariables.push(newName)
        }
        return newName
      }

      if (operation.variableDefinitions.length > 0 && newOperation.variableDefinitions.length > 0) {
        // check for duplicate variables
        existingVariables.push(...operation.variableDefinitions.map(v => v.variable.name.value))
        varsToRename = newOperation.variableDefinitions.map(v => {
          const varName = v.variable.name.value;
          if (existingVariables.includes(varName)) {
            return varName
          } else {
            existingVariables.push(varName)
          }
        })
      }

      const newDocument = visit(this.document, {
        [Kind.SELECTION_SET]: {
          enter(node) {
            if (node.selections.find(s => s.name && s.name.value === __SELECTIONS__)) {
              return Object.assign({}, node, {
                selections: node.selections
                  .filter(s => s.name.value !== __SELECTIONS__)
                  .concat(operation.selectionSet.selections)
              })
            }
          }
        },
        [Kind.VARIABLE]: {
          enter(node) {
            if (varsToRename.length > 0 && varsToRename.includes(node.name.value)) {
              node.name.value = getNewVariableName(node.name.value)
            }
          }
        },
        enter(node) {
          if (operation.selectionSet.selections.includes(node)) {
            return false;
          }
        }
        // TODO can we potentially end the traversal early to prevent unnecessary visiting?
        // enter(node, visitor) {
        //   // if replaced all the __SELECTIONS__ and varsToRename.length === 0
        //   return BREAK
        // }
      })

      newOperation = newDocument.definitions.find(
        def => def.kind === Kind.OPERATION_DEFINITION
      )

      // include all original variables, delegateToSchema uses FilterToSchema to remove unused ones already
      newOperation.variableDefinitions = newOperation.variableDefinitions.concat(operation.variableDefinitions)

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

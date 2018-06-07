/* eslint-disable consistent-return */
const { parse, Kind, visit, print } = require('graphql')

const nest = (path, selections) => {
  if (!path) return selections

  const selection = {}
  const fields = path.split('.').filter(isNaN)
  fields.reduce((accum, field, i, array) => {
    accum.kind = Kind.FIELD
    accum.name = {
      kind: Kind.NAME,
      value: field
    }

    accum.arguments = []

    if (i === array.length - 1) {
      if (selections) {
        accum.selectionSet = {
          kind: Kind.SELECTION_SET,
          selections
        }
      }

      return accum
    }

    accum.selectionSet = {
      kind: Kind.SELECTION_SET,
      selections: [{}]
    }

    return accum.selectionSet.selections[0]
  }, selection)

  return [selection]
}

const pickField = (selections, field) => {
  const firstSelection = selections[0] // TODO handle multiple selections?
  if (firstSelection.kind === Kind.FIELD && firstSelection.name.value === field) {
    if (firstSelection.selectionSet) {
      return firstSelection.selectionSet.selections
    }
    return selections.filter(sel => sel.name.value === field)
  }
  if (firstSelection.kind === Kind.INLINE_FRAGMENT) {
    return pickField(firstSelection.selectionSet.selections, field)
  }
  return selections
}

const pick = (path, selections) => {
  if (!path) {
    return selections
  }
  const fields = path.split('.').filter(isNaN)
  const ret = fields.reduce(pickField, selections)
  return ret
}

class NestTransform {
  constructor(path) {
    this.path = path
  }

  transformRequest(originalRequest) {
    const operation = originalRequest.document.definitions.find(
      def => def.kind === Kind.OPERATION_DEFINITION
    )

    const selections = nest(this.path, operation.selectionSet.selections)

    operation.selectionSet = {
      kind: Kind.SELECTION_SET,
      selections
    }

    return originalRequest
  }
}

class InlineFragmentTransform {
  constructor(type) {
    this.type = type
  }

  transformRequest(originalRequest) {
    if (this.type) {
      const operation = originalRequest.document.definitions.find(
        def => def.kind === Kind.OPERATION_DEFINITION
      )

      operation.selectionSet = {
        kind: Kind.SELECTION_SET,
        selections: [
          {
            kind: Kind.INLINE_FRAGMENT,
            typeCondition: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: this.type
              }
            },
            directives: [],
            selectionSet: operation.selectionSet
          }
        ]
      }
    }

    return originalRequest
  }
}

class PickTransform {
  constructor(path) {
    this.path = path
  }

  transformRequest(originalRequest) {
    const operation = originalRequest.document.definitions.find(
      def => def.kind === Kind.OPERATION_DEFINITION
    )

    operation.selectionSet = {
      kind: Kind.SELECTION_SET,
      selections: pick(this.path, operation.selectionSet.selections)
    }

    return originalRequest
  }
}

const __SELECTIONS__ = '__SELECTIONS__'
class DocumentTransform {
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
DocumentTransform.__SELECTIONS__ = __SELECTIONS__

class Debug {
  transformRequest(originalRequest) {
    console.log(
      [
        originalRequest.operationName,
        print(
          originalRequest.document.definitions.find(def => def.kind === Kind.OPERATION_DEFINITION)
        ),
        JSON.stringify(originalRequest.variables, null, 2)
      ].join('\n')
    )
    return originalRequest
  }
}

exports.nest = nest
exports.pick = pick
exports.NestTransform = NestTransform
exports.PickTransform = PickTransform
exports.InlineFragmentTransform = InlineFragmentTransform
exports.DocumentTransform = DocumentTransform
exports.Debug = Debug
module.exports = exports.default = {
  nest,
  pick,
  NestTransform,
  PickTransform,
  InlineFragmentTransform,
  DocumentTransform,
  Debug
}

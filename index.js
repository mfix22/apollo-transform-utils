/* eslint-disable consistent-return */
const { Kind, print } = require('graphql')

const PickTransform = require('./src/pick')
const DocumentTransform = require('./src/document')
const { findOperationDefinition } = require('./src/util')

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

class NestTransform {
  constructor(path) {
    this.path = path
  }

  transformRequest(originalRequest) {
    const operation = findOperationDefinition(originalRequest.document)

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
      const operation = findOperationDefinition(originalRequest.document)

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

class Debug {
  transformRequest(originalRequest) {
    console.log(
      [
        originalRequest.operationName,
        print(findOperationDefinition(originalRequest.document)),
        JSON.stringify(originalRequest.variables, null, 2)
      ].join('\n')
    )
    return originalRequest
  }
}

exports = module.exports = exports.default = {
  nest,
  pick: PickTransform.pick,
  NestTransform,
  PickTransform,
  InlineFragmentTransform,
  DocumentTransform,
  Debug
}

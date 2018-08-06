const { Kind } = require('graphql')
const { findOperationDefinition } = require('./util')

const createRootObj = key => (isNaN(parseInt(key, 10)) ? {} : Array(parseInt(key, 10)))
const assign = (keys, obj = Object.create(null)) => value => {
  if (!keys) return value

  keys.split('.').reduce((accum, key, i, array) => {
    if (i === array.length - 1) accum[key] = value
    else if (!accum[key]) accum[key] = createRootObj(array[i + 1])
    return accum[key]
  }, obj)

  return obj
}

const pickField = (selections, field) => {
  const firstSelection = selections[0] // TODO handle multiple selections?
  if (firstSelection.kind === Kind.FIELD && firstSelection.name.value === field) {
    if (firstSelection.selectionSet) {
      return firstSelection.selectionSet.selections
    }
    return selections.filter(sel => sel.name && sel.name.value === field)
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

class PickTransformRequest {
  constructor(path) {
    this.path = path
  }

  transformRequest(originalRequest) {
    const operation = findOperationDefinition(originalRequest.document)

    operation.selectionSet = {
      kind: Kind.SELECTION_SET,
      selections: pick(this.path, operation.selectionSet.selections)
    }

    return originalRequest
  }
}

class PickTransformResult {
  constructor(path) {
    this.path = path
    this.assign = assign(`data.${path}`)
  }
  transformResult(response) {
    return this.assign(response.data)
  }
}

class PickTransform {
  constructor(path) {
    this.request = new PickTransformRequest(path)
    this.response = new PickTransformResult(path)
  }

  transformRequest(originalRequest) {
    return this.request.transformRequest(originalRequest)
  }

  transformResult(response) {
    return this.response.transformResult(response)
  }
}
PickTransform.Request = PickTransformRequest
PickTransform.Result = PickTransformResult

module.exports = PickTransform
module.exports.pick = pick

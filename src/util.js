const { Kind } = require('graphql')

exports.findOperationDefinition = document => document.definitions.find(def => def.kind === Kind.OPERATION_DEFINITION)

exports.get = key => obj => {
  if (!key) return obj
  return key.split('.').reduce((accum, k) => (accum != null ? accum[k] : undefined), obj)
}

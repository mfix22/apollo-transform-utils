const { Kind } = require('graphql')

exports.findOperationDefinition = document => document.definitions.find(def => def.kind === Kind.OPERATION_DEFINITION)

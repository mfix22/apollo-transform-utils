const { parse, Kind, visit } = require('graphql')
const { findOperationDefinition, get } = require('./util')

const __SELECTIONS__ = '__SELECTIONS__'

class DocumentTransformRequest {
  constructor(query, args) {
    this.document = typeof query === 'string' ? parse(query) : query
    this.args = args || {}

    /* private */
    this._variableCounter = 0
    this._existingVariables = []
    this._variablesNames = {}
  }

  // generate new variable name same as Apollo's AddArgumentsAsVariables transform
  generateVariableName(name) {
    let varName
    do {
      varName = `_v${this._variableCounter}_${name}`
      this._variableCounter++
    } while (this._existingVariables.indexOf(varName) !== -1)
    return varName
  }

  renameVariable(name) {
    let newName = this._variablesNames[name]
    if (!newName) {
      newName = this.generateVariableName(name)
      this._variablesNames[name] = newName
      this._existingVariables.push(newName)
    }
    return newName
  }

  transformRequest(originalRequest) {
    const _ = this

    if (this.document) {
      const operation = findOperationDefinition(originalRequest.document)
      const newOperation = findOperationDefinition(this.document)

      const varsToRename = []

      const renameVariable = name => {
        let newName = this._variablesNames[name]
        if (!newName) {
          newName = _.generateVariableName(name)
          this._variablesNames[name] = newName
          this._existingVariables.push(newName)
        }
        return newName
      }

      if (operation.variableDefinitions.length > 0 && newOperation.variableDefinitions.length > 0) {
        // check for duplicate variables
        this._existingVariables.push(...operation.variableDefinitions.map(v => v.variable.name.value))
        newOperation.variableDefinitions.forEach(v => {
          const varName = v.variable.name.value
          if (this._existingVariables.includes(varName)) {
            varsToRename.push(varName)
          } else {
            this._existingVariables.push(varName)
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
              node.name.value = _.renameVariable(node.name.value)
            }
          }
        },
        enter(node) {
          if (operation.selectionSet.selections.includes(node)) {
            return false
          }
        }
        // TODO can we potentially end the traversal early to prevent unnecessary visiting?
        // enter(node, visitor) {
        //   // if replaced all the __SELECTIONS__ and varsToRename.length === 0
        //   return BREAK
        // }
      })

      const finalOperation = findOperationDefinition(newDocument)

      // include all original variables definitions, delegateToSchema uses FilterToSchema to remove unused ones already
      finalOperation.variableDefinitions.push(...operation.variableDefinitions)

      // set values into request variables for any variables declaring in new document with values provided via args
      const newToOriginalVarNameMap = Object.entries(this._variablesNames).reduce((accum, [origName, newName]) => {
        accum[newName] = origName
        return accum
      }, {})

      const newVariables = finalOperation.variableDefinitions.reduce((map, def) => {
        const name = def.variable.name.value
        const origName = newToOriginalVarNameMap[name] || name
        if (!map[name] && this.args[origName]) {
          map[name] = this.args[origName]
        }
        return map
      }, Object.assign({}, originalRequest.variables))

      return Object.assign({}, originalRequest, {
        document: newDocument,
        variables: newVariables
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

  transformResult(response) {
    return Object.assign({}, response, { data: this.get(response) })
  }
}

class DocumentTransform {
  constructor(query, args) {
    this.request = new DocumentTransformRequest(query, args)
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

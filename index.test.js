const { print, parse } = require('graphql')
const dedent = require('dedent')
const { applyRequestTransforms } = require('graphql-tools/dist/transforms/transforms')
const {
  nest,
  pick,
  PickTransform,
  InlineFragmentTransform,
  NestTransform,
  DocumentTransform,
  Debug
} = require('.')

const assertSelection = (selection, str) => expect(print(selection).join('\n')).toBe(dedent(str))

describe('nest()', () => {
  test('undefined path should return selections', () => {
    const selections = []
    expect(nest(undefined, selections)).toEqual(selections)
  })

  test('build a full selection, without children', () => {
    const selections = nest('edges.node.id')

    assertSelection(
      selections,
      `edges {
        node {
          id
        }
      }
    `
    )
  })

  test('nest selection under path', () => {
    const selections = nest('edges.node.id')

    const contactSelections = nest('contacts', selections)

    assertSelection(
      contactSelections,
      `contacts {
        edges {
          node {
            id
          }
        }
      }
    `
    )
  })
})

describe('pick()', () => {
  test('undefined path should return selections', () => {
    const selections = []
    expect(pick(undefined, selections)).toEqual(selections)
  })

  test('should deeply grab fields from a selection', () => {
    const selections = parse(`
      query {
        user {
          friends {
            id
            name
          }
        }
      }
    `).definitions[0].selectionSet.selections

    assertSelection(
      pick('user.friends', selections),
      `id
      name`
    )
  })
  test('even with inline fragments', () => {
    const selections = parse(`
      query {
        user {
          ... on User {
            friends {
              id
              name
            }
          }
        }
      }
    `).definitions[0].selectionSet.selections

    assertSelection(
      pick('user.friends', selections),
      `id
      name`
    )
  })
  test('ignores numeric fields', () => {
    const selections = parse(`
      query {
        user {
          friends {
            id
            name
          }
        }
      }
    `).definitions[0].selectionSet.selections

    assertSelection(
      pick('user.friends.0', selections),
      `id
      name`
    )
  })
  test('selecting a scalar field', () => {
    const selections = parse(`
      query {
        user {
          friends {
            id
            name
          }
        }
      }
    `).definitions[0].selectionSet.selections

    assertSelection(pick('user.friends.0.id', selections), 'id')
  })
})

describe('transforms', () => {
  test('Nest, Inline, Pick', () => {
    const operation = {
      document: parse(`
        query ($id: ID!) {
          node(id: $id) {
            id
          }
        }
      `),
      variables: {
        id: 1
      }
    }

    expect(applyRequestTransforms(operation, [
      new PickTransform(),
      new InlineFragmentTransform(),
      new NestTransform()
    ])).toEqual(operation)

    const transforms = [
      new PickTransform('node'),
      new InlineFragmentTransform('User'),
      new NestTransform('node')
    ]
    const newOp = applyRequestTransforms(operation, transforms)

    expect(print(newOp.document).trim()).toEqual(dedent`query ($id: ID!) {
        node {
          ... on User {
            id
          }
        }
      }`
    )
  })
  test('Debug', () => {
    const operation = {
      document: parse(`
        query ($id: ID!) {
          node(id: $id) {
            id
          }
        }
      `),
      variables: {
        id: 1
      }
    }

    const stub = jest.spyOn(console, 'log').mockImplementation(() => undefined)

    const transforms = [
      new Debug()
    ]

    const newOp = applyRequestTransforms(operation, transforms)

    expect(stub).toHaveBeenCalled()
    expect(stub).toHaveBeenCalledWith(expect.stringContaining('query ($id: ID!) {'))
    stub.mockRestore()
  })

  describe('DocumentTransform', () => {
    test('should put the selections in the specified place in the new document', () => {
      const operation = {
        document: parse(`{
          node {
            id
          }
        }`)
      }

      expect(applyRequestTransforms(operation, [ new DocumentTransform() ]).document).toEqual(operation.document)

      const transforms = [
        new PickTransform('node'),
        new DocumentTransform(`query {
          user {
            ... on User {
              ${DocumentTransform.__SELECTIONS__}
            }
          }
        }`)
      ]

      const newOp = applyRequestTransforms(operation, transforms)

      expect(print(newOp.document).trim()).toEqual(dedent`{
          user {
            ... on User {
              id
            }
          }
        }`
      )
    })

    test('should persist variables declared used in the selection', () => {
      const operation = {
        document: parse(`query ($someVar: String) {
          node {
            id
            fieldWithArg(someArg: $someVar)
          }
        }`)
      }

      const transforms = [
        new PickTransform('node'),
        new DocumentTransform(`query {
          user {
            ... on User {
              ${DocumentTransform.__SELECTIONS__}
            }
          }
        }`)
      ]

      const newOp = applyRequestTransforms(operation, transforms)

      expect(print(newOp.document).trim()).toEqual(dedent`query ($someVar: String) {
          user {
            ... on User {
              id
              fieldWithArg(someArg: $someVar)
            }
          }
        }`
      )
    })

    test('should support variables declared in the new document', () => {
      const operation = {
        document: parse(`query ($someVar: String) {
          node {
            id
            fieldWithArg(someArg: $someVar)
          }
        }`)
      }

      const transforms = [
        new PickTransform('node'),
        new DocumentTransform(`query ($newVar: ID) {
          user {
            ... on User {
              ${DocumentTransform.__SELECTIONS__}
            }
            otherField(withId: $newVar)
          }
        }`)
      ]

      const newOp = applyRequestTransforms(operation, transforms)

      expect(print(newOp.document).trim()).toEqual(dedent`query ($newVar: ID, $someVar: String) {
          user {
            ... on User {
              id
              fieldWithArg(someArg: $someVar)
            }
            otherField(withId: $newVar)
          }
        }`
      )
    })

    test('should prevent variable name conflicts between those in selction and newly declared', () => {
      const operation = {
        document: parse(`query ($someVar: String) {
          node {
            id
            fieldWithArg(someArg: $someVar)
          }
        }`)
      }

      const transforms = [
        new PickTransform('node'),
        new DocumentTransform(`query ($someVar: ID) {
          user {
            ... on User {
              ${DocumentTransform.__SELECTIONS__}
            }
            otherField(withId: $someVar)
          }
        }`)
      ]

      const newOp = applyRequestTransforms(operation, transforms)

      // TODO this will fail right now, we need to implement something to produce _generatedVar, or conceptually similar
      expect(print(newOp.document).trim()).toEqual(dedent`query ($_generatedVar: ID, $someVar: String) {
          user {
            ... on User {
              id
              fieldWithArg(someArg: $someVar)
            }
            otherField(withId: $_generatedVar)
          }
        }`
      )
    })
  })
})

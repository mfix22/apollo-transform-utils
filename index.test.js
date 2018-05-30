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

  test('DocumentTransform', () => {
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
          ${DocumentTransform.__SELECTIONS__}
        }
      }`)
    ]

    const newOp = applyRequestTransforms(operation, transforms)

    expect(print(newOp.document).trim()).toEqual(dedent`{
        user {
          id
        }
      }`
    )
  })
})

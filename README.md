# `apollo-transform-utils`
> Utility transforms to be used as [`graphql-tools` transforms](https://www.apollographql.com/docs/graphql-tools/schema-transforms#Transform)

## Getting Started
Install `apollo-transform-utils` with
```sh
$ npm i apollo-transform-utils
```
or
```sh
$ yarn add apollo-transform-utils
```
and use them within your `delegateToSchema` resolvers:
```js
const { Debug, PickTransform, InlineFragmentTransform, NestTransform } = require('apollo-transform-utils')

const transforms = [
  new PickTransform(fieldName),
  new InlineFragmentTransform('ContactInfo')
  new NestTransform(`${fieldName}.user.info`),
  new Debug()
]

// within resolver
return info.mergeInfo
    .delegateToSchema({
      schema: info.schema,
      operation: info.operation.operation,
      fieldName,
      args,
      context,
      info,
      transforms
    })
```

## Usage

### `NestTransform(path: string)`
Place your current selection set under a specified period-delimited path
##### Example
```js
const { NestTransform } = require('apollo-transform-utils')

const path = 'user.contactInfo'

const transforms = [
  new NestTransform(path)
]

/*
 * { number } -> { user { contactInfo { number } } }
 */
```

### `PickTransform(path: string)`
Opposite of `NestTransform`. Select selections along a period-delimited path.
##### Example
```js
const { PickTransform } = require('apollo-transform-utils')

const path = 'user.contactInfo'

const transforms = [
  new PickTransform(path)
]

/*
 * { user { contactInfo { number } } } -> { number }
 */
```

### `InlineFragmentTransform(typeName: string)`
Nest your currently selection under a inline fragment of type `typeName`

##### Example
```js
const { InlineFragmentTransform } = require('apollo-transform-utils')

const typeName = 'User'

const transforms = [
  new InlineFragmentTransform(typeName)
]

/*
 * { id } -> { ... on User { id } }
 */
```

### `DocumentTransform(query: string | Document)`
Creates a new document and replaces the string `__SELECTIONS__` with your current selection set.

##### Example
```js
const { DocumentTransform } = require('apollo-transform-utils')

const newDocument = `
  query {
    user {
      friends {
        ${DocumentTransform.__SELECTIONS__}
      }
    }
  }
`

const transforms = new DocumentTransform(newDocument)

/*
 * { id } -> { user { friends { id } } }
 */
```
### `Debug`
Transform that pretty prints the current operation's document and variables. Super helpful for determining intermediate results between transforms.
##### Example
```js
const { Debug, PickTransform, InlineFragmentTransform, NestTransform } = require('apollo-transform-utils')

const transforms = [
  new Debug(),
    new PickTransform(fieldName),
  new Debug(),
    new InlineFragmentTransform('ContactInfo')
  new Debug(),
    new NestTransform(`${fieldName}.user.info`),
  new Debug()
]
```


### Utilities
#### `nest(path: string, selections: Array<FieldNode>)`
Used by `NestTransform`, but can be used as a standalone function to nest selections under a certain path.

#### `pick(path: string, selections: Array<FieldNode>)`
Used by `PickTransform`, but can be used as a standalone function to pick a node along the path from a selection set.

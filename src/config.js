import { booleanItem, choiceItem, conditional, literal, numberItem, optional, singleOrArray, stringItem } from "confinode"

  export const description = literal({
    name: stringItem(),
    // server: literal({
    //   url: stringItem('localhost'),
    //   port: numberItem(8080),
    // }),
    // apiId: optional(stringItem()),
    // rules: singleOrArray(
    //   conditional(
    //     data => typeof data === 'string',
    //     stringItem(),
    //     literal({
    //       name: stringItem(),
    //       active: booleanItem(),
    //       mode: choiceItem(['flat', 'deep', 'mixed', 0, 1]),
    //     })
    //   )
    // ),
  })
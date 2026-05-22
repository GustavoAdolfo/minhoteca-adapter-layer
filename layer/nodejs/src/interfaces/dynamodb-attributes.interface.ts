import { AttributeDefinition } from '@aws-sdk/client-dynamodb';

export interface KeyValueAttr {
  attribute: AttributeDefinition;
  attributeValue: any;
  partitionKey: boolean;
  sortKey: boolean;
}

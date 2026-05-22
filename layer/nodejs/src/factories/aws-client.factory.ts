import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { Agent } from 'http';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

const DEFAULT_REGION: string = 'us-east-1';
const DEFAULT_MAX_ATTEMPTS: number = 5;

const logService = new LogService('AWS-Client-Factory');

const optionsConfiguration = () => {
  return {
    region: process.env.AWS_REGION ?? DEFAULT_REGION,
    maxAttempts: process.env.MAX_ATTEMPTS ? Number(process.env.MAX_ATTEMPTS) : DEFAULT_MAX_ATTEMPTS,
    ...(process.env.ENDPOINT && { endpoint: process.env.ENDPOINT }),
    requestHandler: new NodeHttpHandler({
      httpAgent: new Agent({
        keepAlive: false,
      }),
    }),
  };
};

export enum SERVICE_TYPE {
  DYNAMODB = 'DYNAMODB',
  S3 = 'S3',
}

export function createClient(service: SERVICE_TYPE): S3Client | DynamoDBClient | null {
  try {
    const options = optionsConfiguration();
    const localS3Endpoint =
      process.env.ENDPOINT_LOCAL_S3 ??
      (process.env.ENDPOINT && process.env.ENDPOINT.includes('localhost')
        ? process.env.ENDPOINT
        : undefined);
    const isLocalS3 = Boolean(localS3Endpoint);

    switch (service) {
      case SERVICE_TYPE.S3:
        const optionsS3 = {
          ...options,
          ...(localS3Endpoint && { endpoint: localS3Endpoint }),
          ...(isLocalS3 && { forcePathStyle: true }),
          ...(isLocalS3 && { requestChecksumCalculation: 'WHEN_REQUIRED' }),
          ...(isLocalS3 && { responseChecksumValidation: 'WHEN_REQUIRED' }),
        } as unknown as S3ClientConfig;
        return new S3Client(optionsS3);
      case SERVICE_TYPE.DYNAMODB:
        return new DynamoDBClient(options);
      default:
        return null;
    }
  } catch (error) {
    logService.error('Erro ao criar um cliente aws', {
      label: 'createClient',
      service,
      error,
    });
    return null;
  }
}

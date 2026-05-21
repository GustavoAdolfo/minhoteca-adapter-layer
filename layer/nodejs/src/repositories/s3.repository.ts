import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';

export class S3Repository {
  client: S3Client;

  /**
   *
   */
  constructor() {
    this.client = createClient(SERVICE_TYPE.S3) as S3Client;
  }

  async createPreSignedUrlPut(
    bucketName: string,
    objectName: string,
    contentType: string,
    forcePathStyle = false
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectName,
      ContentType: contentType,
    });
    if (forcePathStyle) {
      this.client.config.forcePathStyle = true;
    }
    const url = await getSignedUrl(this.client, command, {
      expiresIn: 60 * 60,
    });
    return url;
  }

  async createPreSignedUrlGet(
    bucketName: string,
    objectName: string,
    contentType: string,
    forcePathStyle = false
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectName,
      ResponseContentType: contentType,
    });
    if (forcePathStyle) {
      this.client.config.forcePathStyle = true;
    }
    const url = await getSignedUrl(this.client, command, {
      expiresIn: 7 * 24 * 60 * 60,
    });
    return url;
  }

  async getDataFromS3File(bucketName: string, keyFile: string): Promise<unknown | null> {
    try {
      const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: keyFile,
      });
      const content: GetObjectCommandOutput = await this.client.send(cmd);
      const data = await content.Body?.transformToString();
      if (!data) {
        return null;
      }
      if (keyFile.endsWith('.txt')) {
        return data;
      }

      const list = JSON.parse(data);
      if (typeof list[Symbol.iterator] === 'function') {
        const result = Object.entries(list)
          .map((item) => item[1])
          .filter((value) => value !== undefined);
        return result;
      }
      return list ?? null;
    } catch (error) {
      throw error;
    }
  }

  async getTextFileFromS3File(bucketName: string, keyFile: string): Promise<string | undefined> {
    try {
      const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: keyFile,
      });
      const content: GetObjectCommandOutput = await this.client.send(cmd);
      const fileContent = await content.Body?.transformToString();
      return fileContent;
    } catch (error) {
      throw error;
    }
  }
}

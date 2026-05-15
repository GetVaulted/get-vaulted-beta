import {
  ChannelLatencyMode,
  ChannelType,
  CreateChannelCommand,
  CreateStreamKeyCommand,
  IvsClient,
  StopStreamCommand,
} from '@aws-sdk/client-ivs';

export type IvsClients = { client: IvsClient; region: string };

export function createIvsClient(region: string, accessKeyId: string, secretAccessKey: string): IvsClients {
  const client = new IvsClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, region };
}

export async function ivsCreateChannel(
  client: IvsClient,
  name: string,
  latencyMode: string,
  channelType: string,
) {
  const latency =
    latencyMode === 'NORMAL' ? ChannelLatencyMode.NormalLatency : ChannelLatencyMode.LowLatency;
  const type =
    channelType === 'BASIC' ? ChannelType.BasicChannelType : ChannelType.StandardChannelType;
  const out = await client.send(
    new CreateChannelCommand({
      name,
      latencyMode: latency,
      type,
    }),
  );
  return out;
}

export async function ivsCreateStreamKey(client: IvsClient, channelArn: string) {
  return client.send(new CreateStreamKeyCommand({ channelArn }));
}

export async function ivsStopStream(client: IvsClient, channelArn: string) {
  return client.send(new StopStreamCommand({ channelArn }));
}

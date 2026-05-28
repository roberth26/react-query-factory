// ── AWS SDK types (shaped after real @aws-sdk/client-ec2) ─────────────────────

export interface Filter {
	Name: string;
	Values: string[];
}

export interface Tag {
	Key: string;
	Value: string;
}

export interface InstanceState {
	Name: 'pending' | 'running' | 'shutting-down' | 'terminated' | 'stopping' | 'stopped';
	Code?: number;
}

export interface Instance {
	InstanceId: string;
	InstanceType: string;
	State: InstanceState;
	Tags?: Tag[];
	LaunchTime?: Date;
	VpcId?: string;
	PrivateIpAddress?: string;
}

export interface Reservation {
	ReservationId?: string;
	Instances?: Instance[];
}

export interface DescribeInstancesRequest {
	Filters?: Filter[];
	InstanceIds?: string[];
	MaxResults?: number;
	NextToken?: string;
}

export interface DescribeInstancesResult {
	Reservations?: Reservation[];
	NextToken?: string;
}

export interface StopInstancesRequest {
	InstanceIds: string[];
	DryRun?: boolean;
}

export interface InstanceStateChange {
	CurrentState?: InstanceState;
	InstanceId?: string;
	PreviousState?: InstanceState;
}

export interface StopInstancesResult {
	StoppingInstances?: InstanceStateChange[];
}

export interface DescribeAvailabilityZonesRequest {
	Filters?: Filter[];
	ZoneNames?: string[];
	AllAvailabilityZones?: boolean;
}

export interface AvailabilityZone {
	ZoneName?: string;
	State?: 'available' | 'impaired' | 'unavailable';
	RegionName?: string;
	ZoneId?: string;
}

export interface DescribeAvailabilityZonesResult {
	AvailabilityZones?: AvailabilityZone[];
}

export interface VCpuInfo {
	DefaultVCpus?: number;
}

export interface MemoryInfo {
	SizeInMiB?: number;
}

export interface InstanceTypeInfo {
	InstanceType?: string;
	CurrentGeneration?: boolean;
	VCpuInfo?: VCpuInfo;
	MemoryInfo?: MemoryInfo;
}

export interface DescribeInstanceTypesRequest {
	InstanceTypes?: string[];
	Filters?: Filter[];
	MaxResults?: number;
	NextToken?: string;
}

export interface DescribeInstanceTypesResult {
	InstanceTypes?: InstanceTypeInfo[];
	NextToken?: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export class DescribeInstancesCommand {
	readonly _name = 'DescribeInstances' as const;
	constructor(public readonly input: DescribeInstancesRequest) {}
}

export class StopInstancesCommand {
	readonly _name = 'StopInstances' as const;
	constructor(public readonly input: StopInstancesRequest) {}
}

export class DescribeAvailabilityZonesCommand {
	readonly _name = 'DescribeAvailabilityZones' as const;
	constructor(public readonly input: DescribeAvailabilityZonesRequest = {}) {}
}

export class DescribeInstanceTypesCommand {
	readonly _name = 'DescribeInstanceTypes' as const;
	constructor(public readonly input: DescribeInstanceTypesRequest = {}) {}
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const INSTANCE_TYPES = [
	't3.nano', 't3.micro', 't3.small', 't3.medium', 't3.large', 't3.xlarge',
	'm5.large', 'm5.xlarge', 'm5.2xlarge',
	'c5.large', 'c5.xlarge', 'c5.2xlarge',
	'r5.large', 'r5.xlarge',
];

const STATES: InstanceState['Name'][] = [
	'running', 'running', 'running', 'running', 'running',
	'running', 'running', 'stopped', 'stopped', 'terminated',
];

const VPC_IDS = ['vpc-0a1b2c3d', 'vpc-1e2f3a4b', 'vpc-2c3d4e5f'];

const ALL_INSTANCES: Instance[] = Array.from({ length: 95 }, (_, i) => ({
	InstanceId: `i-${String(i + 1).padStart(8, '0')}`,
	InstanceType: INSTANCE_TYPES[i % INSTANCE_TYPES.length]!,
	State: { Name: STATES[i % STATES.length]!, Code: 16 },
	Tags: [{ Key: 'Name', Value: `prod-worker-${String(i + 1).padStart(3, '0')}` }],
	LaunchTime: new Date(Date.now() - (i * 86_400_000)),
	VpcId: VPC_IDS[i % VPC_IDS.length],
	PrivateIpAddress: `10.0.${Math.floor(i / 256)}.${i % 256}`,
}));

const ALL_AZS: AvailabilityZone[] = [
	{ ZoneName: 'us-east-1a', State: 'available', RegionName: 'us-east-1', ZoneId: 'use1-az1' },
	{ ZoneName: 'us-east-1b', State: 'available', RegionName: 'us-east-1', ZoneId: 'use1-az2' },
	{ ZoneName: 'us-east-1c', State: 'available', RegionName: 'us-east-1', ZoneId: 'use1-az4' },
	{ ZoneName: 'us-east-1d', State: 'available', RegionName: 'us-east-1', ZoneId: 'use1-az6' },
	{ ZoneName: 'us-east-1e', State: 'impaired',  RegionName: 'us-east-1', ZoneId: 'use1-az3' },
	{ ZoneName: 'us-east-1f', State: 'available', RegionName: 'us-east-1', ZoneId: 'use1-az5' },
];

const ALL_INSTANCE_TYPES: InstanceTypeInfo[] = [
	{ InstanceType: 't3.nano',    CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 512 } },
	{ InstanceType: 't3.micro',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 1024 } },
	{ InstanceType: 't3.small',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 2048 } },
	{ InstanceType: 't3.medium',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 4096 } },
	{ InstanceType: 't3.large',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 8192 } },
	{ InstanceType: 't3.xlarge',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 16384 } },
	{ InstanceType: 't3.2xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 32768 } },
	{ InstanceType: 't2.micro',   CurrentGeneration: false, VCpuInfo: { DefaultVCpus: 1 },  MemoryInfo: { SizeInMiB: 1024 } },
	{ InstanceType: 't2.small',   CurrentGeneration: false, VCpuInfo: { DefaultVCpus: 1 },  MemoryInfo: { SizeInMiB: 2048 } },
	{ InstanceType: 't2.medium',  CurrentGeneration: false, VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 4096 } },
	{ InstanceType: 't2.large',   CurrentGeneration: false, VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 8192 } },
	{ InstanceType: 'm5.large',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 8192 } },
	{ InstanceType: 'm5.xlarge',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 16384 } },
	{ InstanceType: 'm5.2xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 32768 } },
	{ InstanceType: 'm5.4xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 16 }, MemoryInfo: { SizeInMiB: 65536 } },
	{ InstanceType: 'm5.8xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 32 }, MemoryInfo: { SizeInMiB: 131072 } },
	{ InstanceType: 'c5.large',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 4096 } },
	{ InstanceType: 'c5.xlarge',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 8192 } },
	{ InstanceType: 'c5.2xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 16384 } },
	{ InstanceType: 'c5.4xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 16 }, MemoryInfo: { SizeInMiB: 32768 } },
	{ InstanceType: 'c5.9xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 36 }, MemoryInfo: { SizeInMiB: 73728 } },
	{ InstanceType: 'r5.large',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 16384 } },
	{ InstanceType: 'r5.xlarge',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 32768 } },
	{ InstanceType: 'r5.2xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 65536 } },
	{ InstanceType: 'r5.4xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 16 }, MemoryInfo: { SizeInMiB: 131072 } },
	{ InstanceType: 'i3.large',   CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 2 },  MemoryInfo: { SizeInMiB: 15616 } },
	{ InstanceType: 'i3.xlarge',  CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 31232 } },
	{ InstanceType: 'i3.2xlarge', CurrentGeneration: true,  VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 62464 } },
	{ InstanceType: 'g4dn.xlarge',  CurrentGeneration: true, VCpuInfo: { DefaultVCpus: 4 },  MemoryInfo: { SizeInMiB: 16384 } },
	{ InstanceType: 'g4dn.2xlarge', CurrentGeneration: true, VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 32768 } },
	{ InstanceType: 'p3.2xlarge',   CurrentGeneration: true, VCpuInfo: { DefaultVCpus: 8 },  MemoryInfo: { SizeInMiB: 61440 } },
	{ InstanceType: 'p3.8xlarge',   CurrentGeneration: true, VCpuInfo: { DefaultVCpus: 32 }, MemoryInfo: { SizeInMiB: 245760 } },
];

// ── EC2Client ─────────────────────────────────────────────────────────────────

export class EC2Client {
	constructor(public readonly config: { region: string }) {}

	send(cmd: DescribeAvailabilityZonesCommand, opts?: { abortSignal?: AbortSignal }): Promise<DescribeAvailabilityZonesResult>;
	send(cmd: DescribeInstancesCommand,         opts?: { abortSignal?: AbortSignal }): Promise<DescribeInstancesResult>;
	send(cmd: DescribeInstanceTypesCommand,     opts?: { abortSignal?: AbortSignal }): Promise<DescribeInstanceTypesResult>;
	send(cmd: StopInstancesCommand,             opts?: { abortSignal?: AbortSignal }): Promise<StopInstancesResult>;
	async send(
		cmd: DescribeAvailabilityZonesCommand | DescribeInstancesCommand | DescribeInstanceTypesCommand | StopInstancesCommand,
		_opts?: { abortSignal?: AbortSignal },
	): Promise<DescribeAvailabilityZonesResult | DescribeInstancesResult | DescribeInstanceTypesResult | StopInstancesResult> {
		await new Promise(r => setTimeout(r, 100 + Math.random() * 80));

		if (cmd instanceof DescribeAvailabilityZonesCommand) {
			return { AvailabilityZones: ALL_AZS };
		}

		if (cmd instanceof StopInstancesCommand) {
			for (const id of cmd.input.InstanceIds) {
				const inst = ALL_INSTANCES.find(i => i.InstanceId === id);
				if (inst?.State.Name === 'running') inst.State = { Name: 'stopped', Code: 80 };
			}
			return {
				StoppingInstances: cmd.input.InstanceIds.map(id => ({
					InstanceId: id,
					CurrentState: { Name: 'stopped' as const, Code: 80 },
					PreviousState: { Name: 'running' as const, Code: 16 },
				})),
			};
		}

		if (cmd instanceof DescribeInstanceTypesCommand) {
			const { MaxResults = 10, NextToken } = cmd.input;
			const start = NextToken ? parseInt(NextToken, 10) : 0;
			const page = ALL_INSTANCE_TYPES.slice(start, start + MaxResults);
			const nextToken = start + MaxResults < ALL_INSTANCE_TYPES.length ? String(start + MaxResults) : undefined;
			return { InstanceTypes: page, NextToken: nextToken };
		}

		// DescribeInstancesCommand
		const { Filters, MaxResults = 20, NextToken } = cmd.input;
		let instances = ALL_INSTANCES;
		if (Filters) {
			for (const f of Filters) {
				if (f.Name === 'instance-state-name') {
					instances = instances.filter(i => f.Values.includes(i.State.Name));
				}
				if (f.Name === 'instance-type') {
					instances = instances.filter(i => f.Values.includes(i.InstanceType));
				}
			}
		}
		const start = NextToken ? parseInt(NextToken, 10) : 0;
		const page = instances.slice(start, start + MaxResults);
		const nextToken = start + MaxResults < instances.length ? String(start + MaxResults) : undefined;
		return { Reservations: [{ Instances: page }], NextToken: nextToken };
	}
}

import { Template } from '../../../assertions';
import * as autoscaling from '../../../aws-autoscaling';
import * as cloudwatch from '../../../aws-cloudwatch';
import * as ec2 from '../../../aws-ec2';
import * as elbv2 from '../../../aws-elasticloadbalancingv2';
import * as cloudmap from '../../../aws-servicediscovery';
import * as cdk from '../../../core';
import * as ecs from '../../lib';
import { DeploymentControllerType, LaunchType } from '../../lib/base/base-service';
import { addDefaultCapacityProvider } from '../util';

describe('external service', () => {
  describe('When creating an External Service', () => {
    test('with only required properties set, it correctly sets default properties', () => {
      // GIVEN
      const stack = new cdk.Stack();
      const vpc = new ec2.Vpc(stack, 'MyVpc', {});
      const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
      addDefaultCapacityProvider(cluster, stack, vpc);
      const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');

      taskDefinition.addContainer('web', {
        image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        memoryLimitMiB: 512,
      });

      const service = new ecs.ExternalService(stack, 'ExternalService', {
        cluster,
        taskDefinition,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
        TaskDefinition: {
          Ref: 'ExternalTaskDef6CCBDB87',
        },
        Cluster: {
          Ref: 'EcsCluster97242B84',
        },
        DeploymentConfiguration: {
          MaximumPercent: 100,
          MinimumHealthyPercent: 0,
        },
        EnableECSManagedTags: false,
        LaunchType: LaunchType.EXTERNAL,
      });

      expect(service.node.defaultChild).toBeDefined();
    });
  });

  test('with all properties set', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    // WHEN
    new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      maxHealthyPercent: 150,
      minHealthyPercent: 55,
      securityGroups: [new ec2.SecurityGroup(stack, 'SecurityGroup1', {
        allowAllOutbound: true,
        description: 'Example',
        securityGroupName: 'Bob',
        vpc,
      })],
      serviceName: 'bonjour',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'ExternalTaskDef6CCBDB87',
      },
      Cluster: {
        Ref: 'EcsCluster97242B84',
      },
      DeploymentConfiguration: {
        MaximumPercent: 150,
        MinimumHealthyPercent: 55,
      },
      DesiredCount: 2,
      LaunchType: LaunchType.EXTERNAL,
      ServiceName: 'bonjour',
    });

  });

  test('with cloudmap set on cluster, throw error', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');

    cluster.addDefaultCloudMapNamespace({
      name: 'foo.com',
      type: cloudmap.NamespaceType.DNS_PRIVATE,
    });

    // THEN
    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      maxHealthyPercent: 150,
      minHealthyPercent: 55,
      securityGroups: [new ec2.SecurityGroup(stack, 'SecurityGroup1', {
        allowAllOutbound: true,
        description: 'Example',
        securityGroupName: 'Bob',
        vpc,
      })],
      serviceName: 'bonjour',
    })).toThrow('Cloud map integration is not supported for External service' );

  });

  test('with multiple security groups, it correctly updates the cfn template', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');
    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });
    const securityGroup1 = new ec2.SecurityGroup(stack, 'SecurityGroup1', {
      allowAllOutbound: true,
      description: 'Example',
      securityGroupName: 'Bingo',
      vpc,
    });
    const securityGroup2 = new ec2.SecurityGroup(stack, 'SecurityGroup2', {
      allowAllOutbound: false,
      description: 'Example',
      securityGroupName: 'Rolly',
      vpc,
    });

    // WHEN
    new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [securityGroup1, securityGroup2],
      serviceName: 'bonjour',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
      TaskDefinition: {
        Ref: 'ExternalTaskDef6CCBDB87',
      },
      Cluster: {
        Ref: 'EcsCluster97242B84',
      },
      DesiredCount: 2,
      LaunchType: LaunchType.EXTERNAL,
      ServiceName: 'bonjour',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Example',
      GroupName: 'Bingo',
      SecurityGroupEgress: [
        {
          CidrIp: '0.0.0.0/0',
          Description: 'Allow all outbound traffic by default',
          IpProtocol: '-1',
        },
      ],
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Example',
      GroupName: 'Rolly',
      SecurityGroupEgress: [
        {
          CidrIp: '255.255.255.255/32',
          Description: 'Disallow all traffic',
          FromPort: 252,
          IpProtocol: 'icmp',
          ToPort: 86,
        },
      ],
    });

  });

  test('with deployment alarms', () => {
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const myAlarm = cloudwatch.Alarm.fromAlarmArn(stack, 'myAlarm', 'arn:aws:cloudwatch:us-east-1:1234567890:alarm:alarm1');

    new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      deploymentAlarms: {
        alarmNames: [myAlarm.alarmName],
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::ECS::Service', {
      DeploymentConfiguration: {
        Alarms: {
          Enable: true,
          Rollback: true,
          AlarmNames: [myAlarm.alarmName],
        },
      },
    });
  });

  test('throws when task definition is not External compatible', () => {
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    const taskDefinition = new ecs.TaskDefinition(stack, 'FargateTaskDef', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
    });
    taskDefinition.addContainer('BaseContainer', {
      image: ecs.ContainerImage.fromRegistry('test'),
      memoryReservationMiB: 10,
    });

    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    })).toThrow('Supplied TaskDefinition is not configured for compatibility with ECS Anywhere cluster');

  });

  test('errors if minimum not less than maximum', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'ExternalTaskDef');
    taskDefinition.addContainer('BaseContainer', {
      image: ecs.ContainerImage.fromRegistry('test'),
      memoryReservationMiB: 10,
    });

    // THEN
    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      minHealthyPercent: 100,
      maxHealthyPercent: 100,
    })).toThrow('Minimum healthy percent must be less than maximum healthy percent.');

  });

  test('error if cloudmap options provided with external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    // THEN
    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      cloudMapOptions: {
        name: 'myApp',
      },
    })).toThrow('Cloud map options are not supported for External service');

    // THEN

  });

  test('error if enableExecuteCommand options provided with external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    // THEN
    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      enableExecuteCommand: true,
    })).toThrow('Enable Execute Command options are not supported for External service');

    // THEN

  });

  test('error if capacityProviderStrategies options provided with external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    // WHEN
    const autoScalingGroup = new autoscaling.AutoScalingGroup(stack, 'asg', {
      vpc,
      instanceType: new ec2.InstanceType('bogus'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
    });

    const capacityProvider = new ecs.AsgCapacityProvider(stack, 'provider', {
      autoScalingGroup,
      enableManagedTerminationProtection: false,
    });

    // THEN
    expect(() => new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      capacityProviderStrategies: [{
        capacityProvider: capacityProvider.capacityProviderName,
      }],
    })).toThrow('Capacity Providers are not supported for External service');

    // THEN

  });

  test('error when performing attachToApplicationTargetGroup to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    const lb = new elbv2.ApplicationLoadBalancer(stack, 'lb', { vpc });
    const listener = lb.addListener('listener', { port: 80 });
    const targetGroup = listener.addTargets('target', {
      port: 80,
    });

    // THEN
    expect(() => service.attachToApplicationTargetGroup(targetGroup)).toThrow('Application load balancer cannot be attached to an external service');

    // THEN

  });

  test('error when performing loadBalancerTarget to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    // THEN
    expect(() => service.loadBalancerTarget({
      containerName: 'MainContainer',
    })).toThrow('External service cannot be attached as load balancer targets');

    // THEN

  });

  test('error when performing registerLoadBalancerTargets to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const lb = new elbv2.ApplicationLoadBalancer(stack, 'lb', { vpc });
    const listener = lb.addListener('listener', { port: 80 });
    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    // THEN
    expect(() => service.registerLoadBalancerTargets(
      {
        containerName: 'MainContainer',
        containerPort: 8000,
        listener: ecs.ListenerConfig.applicationListener(listener),
        newTargetGroupId: 'target1',
      },
    )).toThrow('External service cannot be registered as load balancer targets');

    // THEN

  });

  test('error when performing autoScaleTaskCount to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    // THEN
    expect(() => service.autoScaleTaskCount({
      maxCapacity: 2,
      minCapacity: 1,
    })).toThrow('Autoscaling not supported for external service');

    // THEN

  });

  test('error when performing enableCloudMap to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    // THEN
    expect(() => service.enableCloudMap({})).toThrow('Cloud map integration not supported for an external service');

    // THEN

  });

  test('error when performing associateCloudMapService to an external service', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    const container = taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
    });

    const cloudMapNamespace = new cloudmap.PrivateDnsNamespace(stack, 'TestCloudMapNamespace', {
      name: 'scorekeep.com',
      vpc,
    });

    const cloudMapService = new cloudmap.Service(stack, 'Service', {
      name: 'service-name',
      namespace: cloudMapNamespace,
      dnsRecordType: cloudmap.DnsRecordType.SRV,
    });

    // THEN
    expect(() => service.associateCloudMapService({
      service: cloudMapService,
      container: container,
      containerPort: 8000,
    })).toThrow('Cloud map service association is not supported for an external service');

  });

  test('add warning to annotations if circuitBreaker is specified with a non-ECS DeploymentControllerType', () => {
    // GIVEN
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'MyVpc', {});
    const cluster = new ecs.Cluster(stack, 'EcsCluster', { vpc });
    addDefaultCapacityProvider(cluster, stack, vpc);
    const taskDefinition = new ecs.ExternalTaskDefinition(stack, 'TaskDef');

    taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      memoryLimitMiB: 512,
    });

    const service = new ecs.ExternalService(stack, 'ExternalService', {
      cluster,
      taskDefinition,
      deploymentController: {
        type: DeploymentControllerType.EXTERNAL,
      },
      circuitBreaker: { rollback: true },
    });

    // THEN
    expect(service.node.metadata[0].data).toEqual('taskDefinition and launchType are blanked out when using external deployment controller.');
    expect(service.node.metadata[1].data).toEqual('Deployment circuit breaker requires the ECS deployment controller.');

  });
});

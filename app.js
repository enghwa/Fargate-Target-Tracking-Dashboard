const cdk = require('@aws-cdk/cdk');
const ecs = require('@aws-cdk/aws-ecs');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
const cloudwatch = require('@aws-cdk/aws-cloudwatch');

class BaseInfraResources extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    // Network to run everything in
    this.vpc = new ec2.Vpc(this, 'vpc-php-caddy', {
      maxAZs: 3,
      natGateways: 1
    });

    // Cluster all the containers will run in
    this.cluster = new ecs.Cluster(this, 'fg-cluster', { vpc: this.vpc });
  }
}

class phpcaddy extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    this.phpcaddy = new ecs_patterns.LoadBalancedFargateService(this, 'phpcaddy', {
      cluster: props.cluster,
      image: ecs.ContainerImage.fromAsset(this, 'phpcaddy-image', {
        directory: './caddy-php'
      }),
      containerPort: 2015,
      desiredCount: 2,
      cpu: '256',
      memory: '512',
      environment: {
        AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR'
      },
      createLogs: true
    })

    // ## Autoscaling Tasks  - Target Tracking 
    let phpcaddyServiceAutoScaleTask = this.phpcaddy.service.autoScaleTaskCount({
      maxCapacity: 20,
      minCapacity: 2
    })
    //scale service base on cpu target tracking
    phpcaddyServiceAutoScaleTask.doScaleToTrackMetric('targetTrackingCpu', {
      targetValue: 50,
      predefinedMetric: "ECSServiceAverageCPUUtilization",
      scaleInCooldownSec: 30,
      scaleOutCooldownSec: 30
    })
    //scale service base on cpu target tracking
    phpcaddyServiceAutoScaleTask.doScaleToTrackMetric('targetTrackingMem', {
      targetValue: 50,
      predefinedMetric: "ECSServiceAverageMemoryUtilization",
      scaleInCooldownSec: 30,
      scaleOutCooldownSec: 30
    })
    //ALBRequestCountPerTarget
    phpcaddyServiceAutoScaleTask.doScaleToTrackMetric('targetTrackingAlbReqCount', {
      targetValue: 1000,
      predefinedMetric: "ALBRequestCountPerTarget",
      resourceLabel: this.phpcaddy.loadBalancer.loadBalancerFullName + '/' + this.phpcaddy.targetGroup.targetGroupFullName,
      scaleInCooldownSec: 30,
      scaleOutCooldownSec: 30
    })

    this.dashboard = new cloudwatch.Dashboard(this, "php-caddy-dashboard");

    this.dashboard.add(
      new cloudwatch.TextWidget({
        markdown: '# Fargate Demo Dashboard',
        width: 24
      })
    )

    this.dashboard.add(new cloudwatch.GraphWidget({
      title: "phpcaddy Task Count",
      width: 8,
      left: [new cloudwatch.Metric({
        namespace: "AWS/ECS",
        metricName: 'CPUUtilization',
        label: "Running",
        dimensions: {
          ServiceName: this.phpcaddy.service.serviceName,
          ClusterName: props.cluster.clusterName
        },
        statistic: 'n',
        periodSec: 60
      })]
    }),
      new cloudwatch.GraphWidget({
        title: "ReqCountPerTarget",
        left: [new cloudwatch.Metric({
          namespace: "AWS/ApplicationELB",
          metricName: "RequestCountPerTarget",
          dimensions: {
            TargetGroup: this.phpcaddy.targetGroup.targetGroupFullName,
            LoadBalancer: this.phpcaddy.loadBalancer.loadBalancerFullName
          },
          color: '#98df8a',
          statistic: 'sum',
          periodSec: 60
        })
        ],
        stacked: true
      }),
      new cloudwatch.SingleValueWidget({
        width: 4,
        height: 4,
        metrics: [new cloudwatch.Metric({
          namespace: "AWS/ApplicationELB",
          metricName: "ReqCountPerTarget",
          dimensions: {
            TargetGroup: this.phpcaddy.targetGroup.targetGroupFullName,
            LoadBalancer: this.phpcaddy.loadBalancer.loadBalancerFullName
          },
          color: '#98df8a',
          statistic: 'sum',
          periodSec: 60
        })]
      })
    )

  }
}

class App extends cdk.App {
  constructor(argv) {
    super(argv);

    this.baseResources = new BaseInfraResources(this, 'php-caddy-base-infra');

    this.api = new phpcaddy(this, 'phpcaddy', {
      cluster: this.baseResources.cluster
    });

  }
}

new App().run();

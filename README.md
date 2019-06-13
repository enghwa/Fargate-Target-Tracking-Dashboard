### What?

Based on https://github.com/pahud/ecs-cfn-refarch, it will setup:
- simple php container in AWS Fargate
- various task autoscaling using target tracking
- a very simple CW Dashboard (WIP)

Note: use apache bench (ab) to load test the ALB endpoint to see it autoscale.

### get nodejs
```bash

nvm install 8.12.0 

nvm alias default v8.12.0
```

### install node modules
```bash
npm install
```

### show the aw resources that cdk will create

```bash
npx cdk diff
```

### make sure your aws cli is setup (eg: aws cloudformation), deploy the aws resources
```bash

npx cdk deploy --require-approval never

```


### remove all resources:
```bash
npx cdk destroy
```
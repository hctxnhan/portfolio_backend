import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const stack = pulumi.getStack();
const config = new pulumi.Config();
const notionIntegrationKey = config.requireSecret("notion_integration_key");

// LAMBDA
const lambdaRole = new aws.iam.Role("lambdaRole", {
  assumeRolePolicy: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Effect: "Allow",
      },
    ],
  },
});

const roleAttachment = new aws.iam.RolePolicyAttachment("roleAttachment", {
  policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
  role: lambdaRole,
});

const lambda = new aws.lambda.Function("lambda", {
  role: lambdaRole.arn,
  runtime: "nodejs22.x",
  handler: "index.handler",
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./lambda"),
  }),
  memorySize: 128,
  timeout: 5,
  environment: {
    variables: {
      NOTION_INTEGRATION_KEY: notionIntegrationKey,
      NOTION_BLOG_DATABASE_ID: config.require("notion_blog_database_id"),
    },
  },
});

// API GATEWAY
const api = new aws.apigatewayv2.Api("api", {
  protocolType: "HTTP",
});

// API LAMBDA INTEGRATION
const lambdaIntegration = new aws.apigatewayv2.Integration(
  "lambdaIntegration",
  {
    apiId: api.id,
    integrationType: "AWS_PROXY",
    integrationUri: lambda.arn,
    payloadFormatVersion: "2.0",
    integrationMethod: "GET",
    passthroughBehavior: "WHEN_NO_MATCH",
  }
);

// API LAMBDA PERMISSION
const lambdaPermission = new aws.lambda.Permission("lambdaPermission", {
  action: "lambda:InvokeFunction",
  function: lambda,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// API ROUTE
const route = new aws.apigatewayv2.Route("route", {
  apiId: api.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${lambdaIntegration.id}`,
});

// API STAGE
const stage = new aws.apigatewayv2.Stage("stage", {
  apiId: api.id,
  name: stack,
  routeSettings: [
    {
      routeKey: route.routeKey,
      throttlingBurstLimit: 500,
      throttlingRateLimit: 1000,
    },
  ],
  autoDeploy: true,
});

export const url = pulumi.interpolate`${api.apiEndpoint}/${stage.name}`;

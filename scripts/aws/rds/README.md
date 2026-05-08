# RDS / Aurora

This folder documents the Aurora PostgreSQL database used by the Orchestryx API
and worker services.

Current contents:

- `database.json`: Aurora cluster, writer instance, subnet group, scaling, and security group metadata.

The setup scripts create an Aurora PostgreSQL Serverless v2 cluster named
`orchestryx-db`, a writer instance named `orchestryx-db-writer`, and a DB subnet
group over the configured VPC subnets. Credentials are read from the committed
metadata-free Secrets Manager entry `orchestryx/api/env`; secret values are not
stored here.

# Admin Console

Admins can manage Orchestryx through the frontend `/admin` page and protected `/admin/*` API routes.

The admin UI is migrated in-place to AWS Cloudscape Design System. It lives at `front/app/(protected)/admin/page.tsx`, but the protected layout bypasses the normal user shell for `/admin` so the page can use Cloudscape `TopNavigation` and `AppLayout` without nesting inside the student dashboard navigation.

Cloudscape dependencies are installed in the existing frontend app:

- `@cloudscape-design/components`
- `@cloudscape-design/global-styles`
- `@cloudscape-design/collection-hooks`

Cloudscape global styles are imported from `front/app/layout.tsx`.

## Access Control

Admin routes require a valid Cognito bearer token and one of:

- `users.role = 'admin'` in the Orchestryx database.
- A Cognito `cognito:groups` claim containing `admin`.

Non-admin users receive `403 Admin access required`.

## Console Sections

- Overview: control-plane map, active labs, queued jobs, EC2 hosts, high-risk security groups, spend, credits, and operator findings.
- Compute: tagged Orchestryx EC2 lab hosts with IDs, state, type, AZ, public/private IPs, uptime, linked lab inference, tags, volumes, security groups, cost estimate, and direct EC2 Console links.
- Networking: VPCs, subnets, load balancers, target groups, target health context, route inventory, and AWS Console deep links.
- Security Groups: rule-level ingress/egress debugger. Rules are classified as low, medium, or high risk. Public inbound admin/database ports, broad inbound access, broad outbound access, and unused groups are highlighted.
- Labs: session ownership, status, progress, retries, stack/IP linkage, TTL, runtime, credits, estimated AWS cost, cleanup-required signal, inspect drawer, stop action, and TTL extension.
- Users: role, status, credits, active labs, total launches, credit grants, and user inspector.
- Credits / Billing: Cost Explorer service totals, estimated running EC2 lab cost, spend by user, and the credit ledger.
- Provisioning Jobs: recent lab lifecycle jobs derived from lab rows, including current step, duration, retries, slow-job flag, resource IDs, error text, and cleanup status.
- Logs / Debug: recent API/worker CloudWatch log tail with copy support and CloudWatch Console links.
- Settings: telemetry input summary and action support status.

## Cloudscape Components Used

- `TopNavigation` for product identity, environment label, admin account menu, and logout/account actions.
- `AppLayout`, `SideNavigation`, `BreadcrumbGroup`, `HelpPanel`, and `SplitPanel` for AWS-console-style shell, navigation, help, and contextual detail inspection.
- `Table`, `PropertyFilter`, `Pagination`, and `CollectionPreferences` for resource explorers.
- `Cards`, `Container`, `Header`, `SpaceBetween`, `ColumnLayout`, `KeyValuePairs`, `Tabs`, `Box`, and `Link` for content layout and resource details.
- `StatusIndicator`, `Badge`, `Alert`, `Flashbar`, `Modal`, `Button`, `ButtonDropdown`, `Select`, `Textarea`, and `CopyToClipboard` for operational state, actions, notifications, confirmations, logs, and ID copying.

The admin page intentionally does not import the local shadcn-style `components/ui/*`, Radix dialog wrappers, lucide icons, or framer-motion. Those shared dependencies remain in the repository because non-admin user flows still use them.

## Real Actions

- Stop lab: marks the lab as `DESTROYING`, writes a lab event, and queues the existing worker teardown flow.
- Extend TTL: extends an active lab by 1-24 hours and writes an audit event.
- Add credits: writes an append-only credit transaction.

EC2 reboot/terminate and security group rule remediation are shown as TODO actions in the UI until guarded backend endpoints are implemented. They are intentionally not faked.

## Local Run

Start backend services:

```powershell
cd D:\dev\orchestryx\orchestryx-main
docker compose up --build
```

Start the frontend:

```powershell
cd D:\dev\orchestryx\orchestryx-main\front
npm run dev
```

Open `http://localhost:3000/admin`. The frontend reads `NEXT_PUBLIC_API_URL` from `front/.env.local`; the default local value is `http://localhost:8000`.

The backend still enforces admin access. The frontend role check is only a UI guard.

## Operational Notes

The admin console is designed to cover day-to-day Orchestryx cloud operations, but it still depends on AWS APIs and IAM permissions. Use the direct AWS Console links for unusual cases that need native AWS detail pages.

The AWS overlay uses the API container's AWS credentials. If it shows degraded cards, verify task role permissions for:

- ECS: `DescribeServices`, `ListTasks`, `DescribeTasks`
- SQS: `GetQueueUrl`, `GetQueueAttributes`
- EC2: `DescribeInstances`, `DescribeVpcs`, `DescribeSubnets`, `DescribeSecurityGroups`, `DescribeNetworkInterfaces`, `DescribeRouteTables`
- ELBv2: `DescribeLoadBalancers`, `DescribeTargetGroups`, `DescribeTargetHealth`
- RDS, Cognito, ECR, CloudWatch Logs, CloudFormation, Application Auto Scaling, Secrets Manager, IAM read operations, CloudWatch metrics/alarms, and Cost Explorer

Resource names are configured with `AWS_ECS_CLUSTER`, `AWS_API_SERVICE`, `AWS_WORKER_SERVICE`, `AWS_AURORA_CLUSTER`, `AWS_API_LOG_GROUP`, `AWS_WORKER_LOG_GROUP`, `AWS_ECR_API_REPOSITORY`, `AWS_ECR_WORKER_REPOSITORY`, and optional `AWS_VPC_ID`.

Cost estimates inside lab and EC2 views use a small local instance-price map for common `t3` and `t4g` sizes. Treat these as operational estimates; Cost Explorer remains the billing source of truth.

## Adding New Admin Pages

1. Add a new entry to the `AdminSection` union and `sectionLabels` in `front/app/(protected)/admin/page.tsx`.
2. Add a `SideNavigation` link.
3. Prefer Cloudscape `Table` with `PropertyFilter`, `Pagination`, `CollectionPreferences`, and `SplitPanel` detail content.
4. Reuse existing `/admin/*` API contracts where possible. If a backend action is missing, render a disabled Cloudscape action with a clear TODO rather than fake data.
5. Keep destructive actions behind `Modal` confirmation and backend authorization.

For initial local admin access, set a user row to admin:

```sql
UPDATE users SET role = 'admin' WHERE email = 'operator@example.com';
```

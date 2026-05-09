from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from constructs import Construct


class AuthStack(cdk.Stack):
    """Cognito user pool foundation for web and API authentication."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        auth = config.get("auth", {})

        self.user_pool = cognito.UserPool(
            self,
            "UserPool",
            user_pool_name=auth.get("user_pool_name", f"orchestryx-{env_name}-users"),
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            password_policy=cognito.PasswordPolicy(
                min_length=12,
                require_digits=True,
                require_lowercase=True,
                require_symbols=False,
                require_uppercase=True,
            ),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        self.user_pool_client = self.user_pool.add_client(
            "WebClient",
            user_pool_client_name=auth.get(
                "app_client_name", f"orchestryx-{env_name}-web"
            ),
            auth_flows=cognito.AuthFlow(user_password=True, user_srp=True),
            prevent_user_existence_errors=True,
        )

        cdk.CfnOutput(self, "CognitoUserPoolId", value=self.user_pool.user_pool_id)
        cdk.CfnOutput(
            self,
            "CognitoUserPoolClientId",
            value=self.user_pool_client.user_pool_client_id,
        )


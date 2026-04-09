import boto3
from botocore.exceptions import ClientError
from app.config import AWS_REGION, COGNITO_APP_CLIENT_ID


# Connect to Cognito in our AWS region
client = boto3.client("cognito-idp", region_name=AWS_REGION)


def register_user(email: str, password: str) -> dict:
    """
    Create a new user in Cognito User Pool.
    Cognito automatically sends a verification email.
    """
    try:
        response = client.sign_up(
            ClientId=COGNITO_APP_CLIENT_ID,
            Username=email,
            Password=password,
            UserAttributes=[
                {"Name": "email", "Value": email}
            ]
        )
        return {"message": "Registration successful. Please check your email to verify your account."}

    except ClientError as e:
        # Extract the error message from AWS response
        error = e.response["Error"]["Code"]

        if error == "UsernameExistsException":
            raise ValueError("An account with this email already exists.")
        elif error == "InvalidPasswordException":
            raise ValueError("Password does not meet requirements.")
        elif error == "InvalidParameterException":
            raise ValueError("Invalid email or password format.")
        else:
            raise ValueError(f"Registration failed: {error}")


def login_user(email: str, password: str) -> dict:
    """
    Authenticate a user against Cognito.
    Returns JWT tokens on success.
    """
    try:
        response = client.initiate_auth(
            ClientId=COGNITO_APP_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PASSWORD": password
            }
        )

        tokens = response["AuthenticationResult"]

        return {
            "access_token": tokens["AccessToken"],
            "id_token": tokens["IdToken"],
            "refresh_token": tokens["RefreshToken"],
            "token_type": "Bearer"
        }

    except ClientError as e:
        error = e.response["Error"]["Code"]

        if error == "NotAuthorizedException":
            raise ValueError("Incorrect email or password.")
        elif error == "UserNotConfirmedException":
            raise ValueError("Please verify your email before logging in.")
        elif error == "UserNotFoundException":
            raise ValueError("No account found with this email.")
        else:
            raise ValueError(f"Login failed: {error}")


def confirm_email(email: str, code: str) -> dict:
    """
    Confirm a user's email address using the verification code
    sent by Cognito after registration.
    """
    try:
        client.confirm_sign_up(
            ClientId=COGNITO_APP_CLIENT_ID,
            Username=email,
            ConfirmationCode=code
        )
        return {"message": "Email verified successfully. You can now log in."}

    except ClientError as e:
        error = e.response["Error"]["Code"]

        if error == "CodeMismatchException":
            raise ValueError("Invalid verification code.")
        elif error == "ExpiredCodeException":
            raise ValueError("Verification code has expired. Please request a new one.")
        else:
            raise ValueError(f"Verification failed: {error}")


def refresh_token(refresh_token: str) -> dict:
    """
    Get a new access token using a refresh token.
    Called when the access token expires (after 1 hour).
    """
    try:
        response = client.initiate_auth(
            ClientId=COGNITO_APP_CLIENT_ID,
            AuthFlow="REFRESH_TOKEN_AUTH",
            AuthParameters={
                "REFRESH_TOKEN": refresh_token
            }
        )

        tokens = response["AuthenticationResult"]

        return {
            "access_token": tokens["AccessToken"],
            "id_token": tokens["IdToken"],
            "token_type": "Bearer"
        }

    except ClientError as e:
        raise ValueError("Invalid or expired refresh token.")
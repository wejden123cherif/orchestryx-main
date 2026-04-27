from apps.api.models.lab_template import LabTemplate


LAB_TEMPLATES = [
    LabTemplate(
        id="web-sqli-01",
        title="SQL Injection - Login Bypass",
        category="Web",
        difficulty="Beginner",
        description="Exploit a classic SQL injection vulnerability in the OWASP Juice Shop login form. Use SQL injection to bypass authentication and log in as the admin user without knowing the password. A flag is hidden in the admin account.",
        credits_cost=1,
        ttl_hours=2,
        docker_image_uri="bkimminich/juice-shop:latest",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        is_active=True,
    ),
]

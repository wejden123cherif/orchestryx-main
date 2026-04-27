import aws_cdk as core
import aws_cdk.assertions as assertions

from orchestryx_infra.orchestryx_infra_stack import LabStack

# example tests. To run these tests, uncomment this file along with the example
# resource in orchestryx_infra/orchestryx_infra_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = LabStack(
        app,
        "infra-test",
        instance_id="test-001",
        docker_image="bkimminich/juice-shop:latest",
        wg_server_privkey="TEST_PRIVKEY",
        wg_client_pubkey="TEST_PUBKEY",
        flag="ORCHESTRYX{test_flag}",
    )
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })

import aws_cdk as core
import aws_cdk.assertions as assertions

from orchestryx_infra.orchestryx_infra_stack import LabStack


def test_lab_stack_creates_one_wireguard_only_lab_instance():
    # This test protects the MVP contract: one isolated AWS lab, one EC2 host,
    # WireGuard-only inbound access, encrypted disk, and worker-readable outputs.
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

    # One lab session should not accidentally create multiple compute hosts yet.
    template.resource_count_is("AWS::EC2::Instance", 1)
    template.resource_count_is("AWS::EC2::VPC", 1)

    # Public inbound access must stay limited to WireGuard UDP 51820.
    template.has_resource_properties(
        "AWS::EC2::SecurityGroup",
        {
            "SecurityGroupIngress": assertions.Match.array_with(
                [
                    assertions.Match.object_like(
                        {
                            "IpProtocol": "udp",
                            "FromPort": 51820,
                            "ToPort": 51820,
                            "CidrIp": "0.0.0.0/0",
                        }
                    )
                ]
            )
        },
    )
    # The EC2 host should remain cheap for MVP labs and use encrypted GP3 disk.
    template.has_resource_properties(
        "AWS::EC2::Instance",
        {
            "InstanceType": "t3.small",
            "BlockDeviceMappings": assertions.Match.array_with(
                [
                    assertions.Match.object_like(
                        {
                            "DeviceName": "/dev/sda1",
                            "Ebs": assertions.Match.object_like(
                                {
                                    "Encrypted": True,
                                    "VolumeSize": 20,
                                    "VolumeType": "gp3",
                                }
                            ),
                        }
                    )
                ]
            ),
        },
    )
    # CDK renders IMDSv2 through a launch template for this instance.
    template.has_resource_properties(
        "AWS::EC2::LaunchTemplate",
        {
            "LaunchTemplateData": assertions.Match.object_like(
                {
                    "MetadataOptions": {
                        "HttpTokens": "required",
                    },
                }
            ),
        },
    )
    # The worker depends on these outputs after cdk deploy.
    template.has_output("EC2PublicIP", {})
    template.has_output("EC2InstanceId", {})
    template.has_output("ChallengeURL", {"Value": "http://10.8.0.1:3000"})

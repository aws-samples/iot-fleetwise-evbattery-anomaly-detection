#!/bin/bash
# Below echo is to force update Launch Template to update ASG with EC2 running new AMI
# It's inspired from BONES Patching: https://w.amazon.com/bin/view/SystemsManager/InternalUse/Wiki/Patching_Solutions/Cfn_Asg_Replace/#HTriggerpatchingwhennewpatchesarrive
echo "launch with ami: {AMI}"

echo "====================="
echo "Install ECS agent.."
echo "====================="
sudo sh -c "echo 'net.ipv4.conf.all.route_localnet = 1' >> /etc/sysctl.conf"
sudo sysctl -p /etc/sysctl.conf
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo apt install -y iptables-persistent
sudo iptables -t nat -A PREROUTING -p tcp -d 169.254.170.2 --dport 80 -j DNAT --to-destination 127.0.0.1:51679
sudo iptables -t nat -A OUTPUT -d 169.254.170.2 -p tcp -m tcp --dport 80 -j REDIRECT --to-ports 51679
sudo iptables -A INPUT -i eth0 -p tcp --dport 51678 -j DROP
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
sudo mkdir -p /etc/ecs && sudo touch /etc/ecs/ecs.config

# The ECS Cluster name contains cpu architecture
tee /etc/ecs/ecs.config > /dev/null <<EOT
ECS_DATADIR=/data
ECS_ENABLE_TASK_IAM_ROLE=true
ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true
ECS_LOGFILE=/log/ecs-agent.log
ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"]
ECS_LOGLEVEL=info
ECS_CLUSTER=vehicle-simulator-${CPU}
ECS_ENABLE_AWSLOGS_EXECUTIONROLE_OVERRIDE=true
EOT

# ECS Agent docker image support both arm64 and amd64. Download based on EC2 CPU arch
if [[ $(uname -m) = aarch64 ]]; then
    ECS_AGENT_DOCKER_DIGEST=sha256:7279141b04c2500d141c2e8dc429f77147ea3824e7ab39ca5227380f3c9debc1
else
    ECS_AGENT_DOCKER_DIGEST=sha256:36fd2ca64e90eb09df4ad6dbde24992b49b1be240608b93976c3c79b54891e2e
fi
curl -o ecs-agent.tar https://s3.amazonaws.com/amazon-ecs-agent-us-east-1/ecs-agent-latest.tar
sudo docker load --input ./ecs-agent.tar
sudo docker run --name ecs-agent \
--detach=true \
--restart=on-failure:10 \
--volume=/var/run:/var/run \
--volume=/var/log/ecs/:/log \
--volume=/var/lib/ecs/data:/data \
--volume=/etc/ecs:/etc/ecs \
--net=host \
--env-file=/etc/ecs/ecs.config \
amazon/amazon-ecs-agent:v1.60.0@$ECS_AGENT_DOCKER_DIGEST

echo "============================="
echo "Signal CFN instance is ready"
echo "============================="
/opt/aws/bin/cfn-signal -e 0 --stack ${CLUSTER_STACK_NAME} --resource ${ASG_LOGICAL_ID} --region ${AWS_REGION}

echo "========="
echo "Finished!"
echo "========="

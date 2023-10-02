# Below echo is to force update Launch Template to update ASG with EC2 running new AMI
# It's inspired from BONES Patching: https://w.amazon.com/bin/view/SystemsManager/InternalUse/Wiki/Patching_Solutions/Cfn_Asg_Replace/#HTriggerpatchingwhennewpatchesarrive
echo "launch with ami: {AMI}"

echo "====================="
echo "Install ECS agent.."
echo "====================="
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

sudo amazon-linux-extras disable docker
sudo amazon-linux-extras install -y ecs; sudo systemctl enable --now --no-block ecs.service

#echo "============================="
#echo "Signal CFN instance is ready"
#echo "============================="
/opt/aws/bin/cfn-signal -e 0 --stack ${CLUSTER_STACK_NAME} --resource ${ASG_LOGICAL_ID} --region ${AWS_REGION}

echo "========="
echo "Finished!"
echo "========="

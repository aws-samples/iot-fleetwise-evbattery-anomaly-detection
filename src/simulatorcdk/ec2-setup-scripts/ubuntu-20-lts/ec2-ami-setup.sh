#!/bin/bash

# This user data script is run as root

# Install Ubuntu packages
apt update

# TODO apt update seems to fail sometimes - find out root cause and fix, for now.. run it twice
# Added a second update after failing command https://tiny.amazon.com/3lphv6vn/IsenLink
apt update

apt install -y \
    build-essential\
    dkms \
    can-utils \
    htop \
    linux-modules-extra-aws \
    unzip \
    amazon-ecr-credential-helper \
    net-tools

# Install aws-cfn-bootstrap to send signal to cfn
mkdir -p /opt/aws/bin
wget https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
python3 -m easy_install --script-dir /opt/aws/bin aws-cfn-bootstrap-py3-latest.tar.gz
rm aws-cfn-bootstrap-py3-latest.tar.gz

echo "Load SocketCAN modules at startup"
printf "can\ncan-raw\nvcan\ncan-isotp\ncan-gw\n" | sudo tee /etc/modules-load.d/can.conf > /dev/null

echo "Install setup-socketcan"
tee /usr/local/bin/setup-socketcan.sh > /dev/null <<EOT
ip link add dev vcan0 type vcan
ip link set up vcan0
EOT

tee /lib/systemd/system/setup-socketcan.service > /dev/null <<EOT
[Unit]
Description=Setup SocketCAN interfaces
After=multi-user.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh /usr/local/bin/setup-socketcan.sh
[Install]
WantedBy=multi-user.target
EOT

systemctl enable setup-socketcan

# Enable coredumps
ulimit -S -c unlimited
sysctl -w kernel.core_pattern=core

echo "================================"
echo "Configuring Docker to use ECR..."
echo "================================"
sudo mkdir -p /home/ubuntu/.docker
sudo echo "{\"credHelpers\":{\"763496144766.dkr.ecr.us-west-2.amazonaws.com\":\"ecr-login\"}}" > /home/ubuntu/.docker/config.json
sudo echo "export AWS_SDK_LOAD_CONFIG=1" >> /home/ubuntu/.bashrc

echo "================================"
echo "Install AWS CLI"
echo "================================"
cd /home/ubuntu
# Check if running on arm
if [[ $(uname -m) = aarch64 ]]; then
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
else
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
fi
unzip awscliv2.zip
./aws/install

echo "====================="
echo "Install and Setup Docker.."
echo "====================="
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update -y
sudo apt install -y docker-ce docker-ce-cli containerd.io

echo "Allow user ubuntu to run docker without root permission"
sudo usermod -aG docker ubuntu

echo "========="
echo "Finished!"
echo "========="

# This user data script is run as root

yum update

yum install -y \
    iproute-tc\
    dkms \
    htop \
    amazon-ecr-credential-helper \
    git

# Install aws-cfn-bootstrap to send signal to cfn
mkdir -p /opt/aws/bin
wget https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
python3 -m easy_install --script-dir /opt/aws/bin aws-cfn-bootstrap-py3-latest.tar.gz
rm aws-cfn-bootstrap-py3-latest.tar.gz

# Install can-isotp module
git clone https://github.com/hartkopp/can-isotp.git
mv can-isotp /usr/src/can-isotp-1.0
# Although ISO-TP is included in Linux Kernel 5.10. Amazon Linux 2 with Kernel 5.10 doesn't contain it.
sed 's/5,10,0/5,13,0/g' -i /usr/src/can-isotp-1.0/net/can/isotp.c
sed -e s/else// -e s/shell\ uname\ \-r/KERNELRELEASE/ -i /usr/src/can-isotp-1.0/Makefile
tee /usr/src/can-isotp-1.0/dkms.conf > /dev/null <<EOT
PACKAGE_NAME="can-isotp"
PACKAGE_VERSION="1.0"
MAKE[0]="make modules"
CLEAN="make clean"
BUILT_MODULE_NAME[0]="can-isotp"
DEST_MODULE_LOCATION[0]="/kernel/drivers/net/can"
BUILT_MODULE_LOCATION[0]="./net/can"
AUTOINSTALL="yes"
EOT
dkms add -m can-isotp -v 1.0
# dkms build is included in install
# build and install kernel module for all installed kernel versions
ls /lib/modules | xargs -n1 dkms install -m can-isotp -v 1.0 -k
cp /usr/src/can-isotp-1.0/include/uapi/linux/can/isotp.h /usr/include/linux/can
modprobe can-isotp

echo "Load SocketCAN modules at startup"
printf "can\ncan-raw\nvcan\ncan-isotp\ncan-gw\n" | sudo tee /etc/modules-load.d/can.conf > /dev/null

# Enable coredumps
ulimit -S -c unlimited
sysctl -w kernel.core_pattern=core

echo "================================"
echo "Configuring Docker to use ECR..."
echo "================================"
sudo mkdir -p /home/ec2-user/.docker
sudo echo "{\"credHelpers\":{\"763496144766.dkr.ecr.us-west-2.amazonaws.com\":\"ecr-login\"}}" > /home/ec2-user/.docker/config.json
sudo echo "export AWS_SDK_LOAD_CONFIG=1" >> /home/ec2-user/.bashrc

echo "========="
echo "Finished setup AMI!"
echo "========="

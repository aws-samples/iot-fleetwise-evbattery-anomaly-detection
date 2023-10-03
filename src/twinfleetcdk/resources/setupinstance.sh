#!/bin/bash
# 
# install grafana on new ec2 instance
# 
sudo echo "[grafana]
name=grafana
baseurl=https://rpm.grafana.com
repo_gpgcheck=1
enabled=1
gpgcheck=1
gpgkey=https://rpm.grafana.com/gpg.key
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
exclude=*beta*" > /tmp/temp.txt

sudo cp /tmp/temp.txt /etc/yum.repos.d/grafana.repo
sudo rm /tmp/temp.txt

sudo yum -y update
sudo yum install -y grafana-enterprise

sudo systemctl daemon-reload
sudo systemctl start grafana-server
sudo systemctl enable grafana-server.service


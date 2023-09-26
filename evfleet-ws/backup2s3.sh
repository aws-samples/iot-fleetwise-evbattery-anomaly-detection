aws s3 cp --recursive ~/evfleet-cdk s3://ashok-b-main/evfleet-cdk-clean --exclude "bin/*" --exclude "lib/*" --exclude "lib64/*" --exclude "venv/*" --exclude ".venv/*"

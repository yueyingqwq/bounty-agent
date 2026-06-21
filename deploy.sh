#!/bin/bash
# Bounty Agent VPS ����ű�
# �� VPS ������: chmod +x deploy.sh && ./deploy.sh

echo "=== ��װ Node.js ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

echo "=== ��¡��Ŀ ==="
git clone https://github.com/yueyingqwq/bounty-agent.git
cd bounty-agent

echo "=== ���� ==="
cat > config.json << 'ENDCONFIG'
{
  "github_token": "YOUR_GITHUB_TOKEN",
  "github_username": "yueyingqwq",
  "openai_api_key": "YOUR_OPENAI_KEY",
  "openai_model": "gpt-4o",
  "data_dir": "./data",
  "min_score_threshold": 55,
  "scan_interval_ms": 600000
}
ENDCONFIG

echo "=== ��װ && ���� ==="
npm install
npm run build
npm install -g pm2
pm2 start dist/index.js --name bounty-agent
pm2 save
pm2 startup

echo ""
echo "? ������ɣ�Bounty Agent ���ں�̨ 24/7 ����"
echo "   �鿴��־: pm2 logs bounty-agent"
echo "   ���:     pm2 monit"
echo "   ����:     pm2 restart bounty-agent"

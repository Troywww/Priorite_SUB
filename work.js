const TLS_PORTS = ['443', '8443', '2053', '2083', '2087', '2096', '2052', '2082', '2086', '2095'];
const NON_TLS_PORTS = ['80', '8080', '2052', '2082', '2086', '2095'];
const SUBUpdateTime = 12;
const total = 1099511627776;
const timestamp = 1725729407;
let addresses = [];
let addressesnotls = [];
let addressesapi = [];
let addressesnotlsapi = [];
let DLS = 1;

async function ADD(envadd) {
    if (!envadd) return [];
    
    console.log('Raw input:', envadd);
    
    const addresses = envadd
        .split(/[\r\n,]+/)
        .map(line => {
            console.log('Processing line:', line);
            
            try {
                // 如果地址包含 # 号，保留注释
                let address, comment;
                if (line.includes('#')) {
                    [address, comment] = line.split('#');
                } else {
                    address = line;
                    comment = '';
                }
                
                console.log('Split parts:', { address, comment });
                
                // 处理地址部分
                address = address.trim();
                
                // 特殊处理 IPv6 地址
                let host, port;
                if (address.includes('[')) {
                    const ipv6Match = address.match(/\[([\da-fA-F:]+)\]:(\d+)/);
                    if (!ipv6Match) {
                        throw new Error('Invalid IPv6 address format');
                    }
                    host = ipv6Match[1];
                    port = ipv6Match[2];
                } else {
                    // 处理普通地址
                    const parts = address.split(':');
                    host = parts[0];
                    port = parts[1];
                }
                
                console.log('Parsed address:', { host, port });
                
                // 验证端口号
                const portNum = parseInt(port);
                if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                    throw new Error('Invalid port number');
                }
                
                // 检查是否是 IPv6 地址
                const isIPv6 = host.includes(':');
                
                // 格式化最终地址
                const formattedHost = isIPv6 ? `[${host}]` : host;
                const finalAddress = comment ? 
                    `${formattedHost}:${port}#${comment.trim()}` : 
                    `${formattedHost}:${port}`;
                
                console.log('Final formatted address:', finalAddress);
                
                return finalAddress;
            } catch (error) {
                console.error('Error processing line:', line, error);
                return null;
            }
        })
        .filter(Boolean);  // 过滤掉处理失败的地址

    console.log('Final addresses array:', addresses);
    return addresses;
}

function safeBase64(str) {
    // 先将字符串转换为 UTF-8 编码
    const utf8Bytes = new TextEncoder().encode(str);
    // 将 UTF-8 字节转换为二进制字符串
    const binaryStr = String.fromCharCode.apply(null, utf8Bytes);
    // 进行 Base64 编码并替换特殊字符
    return btoa(binaryStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAddressescsv(tls, csvUrls) {
    // 如果需要实现 CSV 功能，在这里添加代码
    return [];
}

async function getAddressesapi(apiUrls) {
    let addresses = [];
    for (const url of apiUrls) {
        try {
            const cleanUrl = url.startsWith('@') ? url.slice(1) : url;
            const response = await fetch(cleanUrl);
            if (response.ok) {
                const text = await response.text();
                // 将获取的地址添加到数组中
                addresses.push(...text.split('\n').filter(line => line.trim()));
            }
        } catch (error) {
            console.error('Error fetching API addresses:', error);
        }
    }
    return addresses;
}



async function generateHomePage(env) {
    // 初始化所有地址列表
    let currentAddresses = [];
    let currentNonTLSAddresses = [];
    let currentAPIAddresses = [];
    let currentNonTLSAPIAddresses = [];
    let csvAddresses = [];

    try {
        // 从 KV 存储中读取数据
        const storedADD = await env.BEST_IP.get('ADD') || '';
        const storedADDNOTLS = await env.BEST_IP.get('ADDNOTLS') || '';
        const storedADDAPI = await env.BEST_IP.get('ADDAPI') || '';
        const storedADDNOTLSAPI = await env.BEST_IP.get('ADDNOTLSAPI') || '';

        // 从环境变量获取地址
        if (storedADD) currentAddresses = await ADD(storedADD);
        if (storedADDNOTLS) currentNonTLSAddresses = await ADD(storedADDNOTLS);
        if (storedADDAPI) {
            const apiUrls = await ADD(storedADDAPI);
            const apiAddresses = await getAddressesapi(apiUrls);
            currentAPIAddresses = apiAddresses;
        }
        if (storedADDNOTLSAPI) currentNonTLSAPIAddresses = await ADD(storedADDNOTLSAPI);

        // 获取 CSV 地址
        if (env.ADDCSV) {
            const csvUrls = await ADD(env.ADDCSV);
            csvAddresses = await getAddressescsv('TRUE', csvUrls);
        }

        // 准备显示数据
        const allAddresses = [
            ...currentAddresses.map(addr => ({ addr, type: 'TLS' })),
            ...currentNonTLSAddresses.map(addr => ({ addr, type: 'Non-TLS' })),
            ...currentAPIAddresses.map(addr => ({ addr, type: 'API TLS' })),
            ...currentNonTLSAPIAddresses.map(addr => ({ addr, type: 'API Non-TLS' })),
            ...csvAddresses.map(addr => ({ addr, type: 'CSV' }))
        ];

        // 修改解析函数，确保返回完整的配置象
        function parseSubscriptionUrl(url) {
            try {
                if (url.startsWith('vmess://')) {
                    const decoded = atob(url.slice(8));
                    const config = JSON.parse(decoded);
                    return {
                        type: 'vmess',
                        host: config.add || '',
                        port: config.port || 443,
                        uuid: config.id || '',
                        path: config.path || '/',
                        tls: config.tls === 'tls',
                        sni: config.sni || config.add
                    };
                } else if (url.startsWith('vless://')) {
                    // 修复正则表达式的转义
                    const vlessRegex = /vless:\/\/([^@]+)@([^:]+):(\d+)\/?(?:\?([^#]+))?(?:#.*)?/;
                    const match = url.match(vlessRegex);
                    
                    if (match) {
                        const [, uuid, host, port, queryPart = ''] = match;
                        const searchParams = new URLSearchParams(queryPart);
                        
                        return {
                            type: 'vless',
                            host: searchParams.get('sni') || host,
                            port: parseInt(port),
                            uuid: uuid,
                            path: decodeURIComponent(searchParams.get('path') || '/'),
                            tls: searchParams.get('security') === 'tls'
                        };
                    }
                }
            } catch (error) {
                console.error('Error parsing subscription URL:', error);
            }
            return null;
        }



        // 修改 HTML 表单，添加事件监听器
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>优选订阅</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 20px auto;
                    padding: 0 20px;
                    line-height: 1.6;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input[type="text"], select {
                    width: 96%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background: #45a049;
                }
                .all-container {
                    margin-top: 30px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 15px 20px 15px 20px; /* 上、右、下、左 */
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .ip-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                    table-layout: fixed;
                }
                .ip-table th, .ip-table td {
                    padding: 8px;
                    border: 1px solid #ddd;
                    text-align: left;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .ip-table th:nth-child(1), .ip-table td:nth-child(1) {
                    width: 10%;
                }
                .ip-table th:nth-child(2), .ip-table td:nth-child(2) {
                    width: 50%;
                }
                .ip-table th:nth-child(3), .ip-table td:nth-child(3) {
                    width: 15%;
                }
                .ip-table th:nth-child(4), .ip-table td:nth-child(4) {
                    width: 25%;
                }
                .ip-table th {
                    background-color: #f5f5f5;
                    font-weight: bold;
                }
                .ip-table tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .ip-table tr:hover {
                    background-color: #f0f0f0;
                }
                .ip-list { border: 1px solid #ddd; border-radius: 4px; }

                .ip-list th {
                    background-color: #f5f5f5;
                    font-weight: bold;
                }
                .ip-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start; /* 顶部对齐 */
                    padding: 8px 16px;
                    border-bottom: 1px solid #eee;
                }
                
                .ip-item span {
                    flex-grow: 1;
                    margin-right: 10px;
                    word-break: break-word; /* 允许在单词内换行 */
                }
                
                .delete-btn {
                    background: #ff4444;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px; /* 调整内边距 */
                    height: 30px; /* 固定高度 */
                    line-height: 22px; /* 垂直居中对齐文本 */
                    cursor: pointer;
                    white-space: nowrap; /* 防止文字换行 */
                    flex-shrink: 0; /* 防止按钮缩小 */
                }
                
                .delete-btn:hover {
                    background: #cc0000;
                }
                .result-container {
                    margin-top: 20px;
                    display: none;
                }

                .add-btn {
                    margin-top: 10px;
                    padding: 10px 20px;
                    background-color: #1890ff;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                }



                .add-btn:hover {
                    background-color: #40a9ff;
                }
                    
                .ip-config-grid {
                    display: flex;
                    gap: 20px;
                }

                .ip-config-column {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .config-item {
                    display: flex;
                    flex-direction: column;
                    margin-left: 10px;
                    margin-bottom: 10px; 
                }
                .ip-input {
                    width: 85%; /* 确保输入框占满可用宽度 */
                    height: 40px;
                    padding: 12px;
                    border: 1px solid #d9d9d9;
                    border-radius: 8px;
                    resize: vertical;
                    font-family: monospace;
                    font-size: 14px;
                    line-height: 1.6;
                }
                .ip-input:focus {
                    border-color: #1890ff;
                    box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
                    outline: none;
                }
                .inline-group {
                    display: flex;
                    align-items: center;
                    flex-wrap: nowrap; /* 禁止换行 */
                    margin: 36px 0; /* 上下边距 */
                }

                .inline-group label {
                    white-space: nowrap; /* 禁止标签内换行 */
                    margin-right: 10px;
                }
                .inline-group select, 
                .inline-group input {
                    margin-right: 10px;
                }

                .inline-group input {
                    flex-grow: 1; /* 让输入框占据剩余空间 */
                }
            </style>
        </head>
        <body>
            <div class="all-container">
                <h2>优选订阅</h2>
                <div class="form-group">
                    <label for="originalLink">原始节点链接：</label>
                    <input type="text" id="originalLink" placeholder="请输入 VLESS 或 VMESS 链接">
                    <button onclick="parseLink()" class="add-btn">解析链接</button>
                </div>
                <div class="form-group inline-group" >
                    <label for="newHost">域名：</label>
                    <input type="text" id="newHost">
                </div>
                <div class="form-group inline-group" >
                    <label for="newPath">路径：</label>
                    <input type="text" id="newPath" value="/">
                </div>
                <div class="form-group inline-group" >
                    <label for="newUuid">UUID：</label>
                    <input type="text" id="newUuid">
                </div>
                <div class="form-group inline-group">
                    
                    <label for="newmark">备注：</label>
                    <input type="text" id="newmark" name="newmark" placeholder="请输入备注">
                    <label for="protocol">协议：</label>
                    <select id="protocol">
                        <option value="vless">VLESS</option>
                        <option value="vmess">VMESS</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="tls" checked>
                        启用 TLS
                    </label>
                </div>
                <button onclick="generateSubscription()" class="add-btn">生成订阅链接</button>
                <div id="subscriptionResult" class="result-container">
                    <div class="form-group">
                        <label for="subscriptionLink">订阅链接：</label>
                        <input type="text" id="subscriptionLink" readonly>
                        <button class="copy-button" onclick="copySubscriptionLink()">复制</button>
                    </div>
                </div>
            </div>
            <div class="all-container">
                <h3>IP列表</h3>
                ${allAddresses.length > 0 ? `
                    <table class="ip-table">
                        <thead>
                            <tr>
                                <th>来源</th>
                                <th>IP/域名</th>
                                <th>端口</th>
                                <th>备注</th>
                                <th>TLS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allAddresses.map(({addr, type}) => {
                                const [serverPart, remarkPart = ''] = addr.split('#');
                                let serverAddress, port;
                                try {
                                    if (serverPart.includes('[')) {
                                        const match = serverPart.match(/\[([\da-fA-F:]+)\]:(\d+)/);
                                        if (match) {
                                            serverAddress = match[1];
                                            port = match[2];
                                        }
                                    } else {
                                        const lastColon = serverPart.lastIndexOf(':');
                                        serverAddress = serverPart.substring(0, lastColon);
                                        port = serverPart.substring(lastColon + 1);
                                    }
                                } catch (error) {
                                    console.error('Error parsing address:', serverPart);
                                    serverAddress = 'Invalid Address';
                                    port = 'Invalid Port';
                                }
                                const isTLS = type.includes('TLS') && !type.includes('Non-TLS');
                                return `
                                    <tr>
                                        <td>${type}</td>
                                        <td>${serverAddress}</td>
                                        <td>${port}</td>
                                        <td>${remarkPart}</td>
                                        <td>${isTLS ? '✓' : '✗'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                ` : '<p>暂无可用节点</p>'}
            </div>
            <div class="all-container">
                <h3>优选IP配置</h3>
                <div class="ip-config-grid">
                    <div class="ip-config-column">
                        <div class="config-item">
                            <label>TLS节点:</label>
                            <textarea id="configAdd" class="ip-input" placeholder="每行一个地址"></textarea>
                        </div>
                        <div class="config-item">
                            <label>非TLS节点:</label>
                            <textarea id="configAddnotls" class="ip-input" placeholder="每行一个地址"></textarea>
                        </div>
                    </div>
                    <div class="ip-config-column">
                        <div class="config-item">
                            <label>TLS API地址:</label>
                            <textarea id="configAddapi" class="ip-input" placeholder="每行一个API地址"></textarea>
                        </div>
                        <div class="config-item">
                            <label>非TLS API地址:</label>
                            <textarea id="configAddnotlsapi" class="ip-input" placeholder="每行一个API地址"></textarea>
                        </div>
                    </div>
                </div>
                <button onclick="addIPs()" class="add-btn">添加</button>
            </div>
            <div class="all-container">
                <h3>已保存的地址</h3>
                <div class="address-group">
                    <h4>TLS节点</h4>
                    <div class="ip-list">
                        ${formatSavedAddresses(storedADD, 'ADD')}
                    </div>
                </div>
                <div class="address-group">
                    <h4>非TLS节点</h4>
                    <div class="ip-list">
                        ${formatSavedAddresses(storedADDNOTLS, 'ADDNOTLS')}
                    </div>
                </div>
                <div class="address-group">
                    <h4>TLS API地址</h4>
                    <div class="ip-list">
                        ${formatSavedAddresses(storedADDAPI, 'ADDAPI')}
                    </div>
                </div>
                <div class="address-group">
                    <h4>非TLS API地址</h4>
                    <div class="ip-list">
                        ${formatSavedAddresses(storedADDNOTLSAPI, 'ADDNOTLSAPI')}
                    </div>
                </div>
            </div>
            <script>
                async function deleteAddress(type, address) {
                    if (!confirm('确定要删除这个地址吗？')) return;
                    try {
                        const key = new URLSearchParams(window.location.search).get('key');
                        const response = await fetch('/api/addresses/' + type + '/' + encodeURIComponent(address), {
                            method: 'DELETE',
                            headers: {
                                'Authorization': key
                            }
                        });
                        if (response.ok) {
                            location.reload();
                        } else {
                            alert('删除失败: ' + await response.text());
                        }
                    } catch (error) {
                        alert('删除失败: ' + error.message);
                    }
                }
                    // 解析链接函数
                    function parseLink() {
                        const link = document.getElementById('originalLink').value.trim();
                        if (!link) {
                            alert('请输入节点链接');
                            return;
                        }

                        try {
                            const config = parseSubscriptionUrl(link);
                            if (config) {
                                document.getElementById('newHost').value = config.host;
                                document.getElementById('newPath').value = config.path;
                                document.getElementById('newUuid').value = config.uuid;
                                document.getElementById('protocol').value = config.type;
                                document.getElementById('tls').checked = config.tls;
                            } else {
                                alert('无法解析链接格式');
                            }
                        } catch (error) {
                            console.error('解链接失败:', error);
                            alert('解析链接失败');
                        }
                    }

                    // 生成订阅链接函
                    function generateSubscription() {
                        const config = {
                            host: document.getElementById('newHost').value.trim(),
                            path: document.getElementById('newPath').value.trim(),
                            uuid: document.getElementById('newUuid').value.trim(),
                            protocol: document.getElementById('protocol').value,
                            newmark: document.getElementById('newmark').value,
                            tls: document.getElementById('tls').checked
                        };

                        if (!config.host || !config.uuid) {
                            alert('请填写域名和 UUID');
                            return;
                        }

                        const currentUrl = new URL(window.location.href);
                        const accessKey = currentUrl.searchParams.get('key');
                        
                        if (!accessKey) {
                            alert('缺少访问密钥');
                            return;
                        }

                        const baseUrl = \`\${window.location.origin}/sub\`;
                        const params = new URLSearchParams({
                            key: accessKey,
                            host: config.host,
                            path: config.path || '/',
                            uuid: config.uuid,
                            protocol: config.protocol,
                            newmark: config.newmark,
                            tls: config.tls
                        });

                        const subscriptionUrl = \`\${baseUrl}?\${params.toString()}\`;
                        
                        document.getElementById('subscriptionResult').style.display = 'block';
                        document.getElementById('subscriptionLink').value = subscriptionUrl;
                    }

                    // 复制链接函数
                    function copySubscriptionLink() {
                        const linkInput = document.getElementById('subscriptionLink');
                        linkInput.select();
                        document.execCommand('copy');
                        
                        const copyButton = document.querySelector('.copy-button');
                        copyButton.textContent = '已复制!';
                        setTimeout(() => {
                            copyButton.textContent = '复制';
                        }, 2000);
                    }

                    // 解析订阅接函数
                    function parseSubscriptionUrl(url) {
                        try {
                            if (url.startsWith('vmess://')) {
                                const decoded = atob(url.slice(8));
                                const config = JSON.parse(decoded);
                                return {
                                    type: 'vmess',
                                    host: config.add || '',
                                    port: config.port || 443,
                                    uuid: config.id || '',
                                    path: config.path || '/',
                                    tls: config.tls === 'tls',
                                    sni: config.sni || config.add
                                };
                            } else if (url.startsWith('vless://')) {
                                const vlessRegex = /vless:\\/\\/([^@]+)@([^:]+):(\\d+)\\/?(?:\\?([^#]+))?(?:#.*)?/;
                                const match = url.match(vlessRegex);
                                
                                if (match) {
                                    const [, uuid, host, port, queryPart = ''] = match;
                                    const searchParams = new URLSearchParams(queryPart);
                                    
                                    return {
                                        type: 'vless',
                                        host: searchParams.get('sni') || host,
                                        port: parseInt(port),
                                        uuid: uuid,
                                        path: decodeURIComponent(searchParams.get('path') || '/'),
                                        tls: searchParams.get('security') === 'tls'
                                    };
                                }
                            }
                        } catch (error) {
                            console.error('Error parsing subscription URL:', error);
                        }
                        return null;
                    }

                    // 独立的添加优选IP功能，只处理IP相关的KV储
                    async function addIPs() {
                        try {
                            const key = new URLSearchParams(window.location.search).get('key');
                            if (!key) {
                                alert('缺少访问密钥');
                                return;
                            }
                            
                            // 获取输入框中的新地址
                            const newAddresses = {
                                ADD: document.getElementById('configAdd').value.trim(),
                                ADDNOTLS: document.getElementById('configAddnotls').value.trim(),
                                ADDAPI: document.getElementById('configAddapi').value.trim(),
                                ADDNOTLSAPI: document.getElementById('configAddnotlsapi').value.trim()
                            };

                            const updates = {};
                            for (const [type, newValue] of Object.entries(newAddresses)) {
                                if (newValue) {
                                    updates[type] = newValue;
                                }
                            }

                            if (Object.keys(updates).length === 0) {
                                alert('请输入要添加的地址');
                                return;
                            }

                            const response = await fetch('/api/addresses', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': key
                                },
                                body: JSON.stringify(updates)
                            });

                            if (response.ok) {
                                alert('添加成功');
                                // 清空输入框
                                for (const inputId of ['configAdd', 'configAddnotls', 'configAddapi', 'configAddnotlsapi']) {
                                    document.getElementById(inputId).value = '';
                                }
                                location.reload();
                            } else {
                                const errorText = await response.text();
                                alert('添加失败: ' + errorText);
                            }
                        } catch (error) {
                            alert('添加失败: ' + error.message);
                        }
                    }
                </script>
            </body>
            </html>
        `;
        const newHtml = htmlContent;

        return new Response(newHtml, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' }
        });
    } catch (error) {
        console.error('Error generating home page:', error);
        return new Response('Error generating page: ' + error.message, { status: 500 });
    }
}

// 辅助函数：格式化已存的地址
function formatSavedAddresses(addresses, type) {
    if (!addresses) return '<div class="ip-item">无保存的地址</div>';
    
    const addressList = addresses.split(/[\r\n,]+/)
        .filter(addr => addr.trim())
        .map(addr => `
            <div class="ip-item">
                <span>${addr.trim()}</span>
                <button class="delete-btn" onclick="deleteAddress('${type}', '${addr.trim()}')">删除</button>
            </div>
        `).join('');
    
    return addressList || '<div class="ip-item">无保存的地址</div>';
}

function generateLoginPage(baseUrl) {
    return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>访问验证</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .login-container {
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    width: 90%;
                    max-width: 400px;
                }
                .form-group {
                    margin-bottom: 1rem;
                }
                label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: bold;
                }
                input {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    box-sizing: border-box;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    width: 100%;
                }
                button:hover {
                    background: #45a049;
                }
                button:disabled {
                    background: #cccccc;
                    cursor: not-allowed;
                }
                #error {
                    color: red;
                    margin-top: 1rem;
                    text-align: center;
                    display: none;
                }
                #loading {
                    color: #666;
                    margin-top: 1rem;
                    text-align: center;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2 style="text-align: center; margin-bottom: 2rem;">访问验证</h2>
                <div class="form-group">
                    <label for="accessKey">访问密钥：</label>
                    <input type="password" id="accessKey" placeholder="请输入访问密钥">
                </div>
                <button id="submitBtn" onclick="verifyAccess()">验证</button>
                <div id="error"></div>
                <div id="loading">验证中...</div>
            </div>

            <script>
                function verifyAccess() {
                    const key = document.getElementById('accessKey').value;
                    const errorDiv = document.getElementById('error');
                    const loadingDiv = document.getElementById('loading');
                    const submitBtn = document.getElementById('submitBtn');
                    
                    // 清除之前的错误信息
                    errorDiv.style.display = 'none';
                    
                    // 验证入
                    if (!key) {
                        errorDiv.textContent = '请输入访问密钥';
                        errorDiv.style.display = 'block';
                        return;
                    }
                    
                    // 显示加载状态
                    loadingDiv.style.display = 'block';
                    submitBtn.disabled = true;
                    
                    // 构建目标URL并跳转
                    window.location.href = '${baseUrl}?key=' + encodeURIComponent(key);
                }

                // 添加回车键支持
                document.getElementById('accessKey').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        verifyAccess();
                    }
                });

                // 页加载完成后聚焦到输入框
                window.onload = function() {
                    document.getElementById('accessKey').focus();
                };
            </script>
        </body>
        </html>
    `, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // 删除地址的路由
        if (url.pathname.startsWith('/api/addresses/') && request.method === 'DELETE') {
            try {
                const key = request.headers.get('Authorization');
                if (key !== env.ACCESS_KEY?.trim()) {
                    return new Response('Unauthorized', { status: 401 });
                }

                const [, , , type, ...addressParts] = url.pathname.split('/');
                const addressToDelete = decodeURIComponent(addressParts.join('/'));

                const currentAddresses = await env.BEST_IP.get(type) || '';
                const addressArray = currentAddresses.split(/[\r\n,]+/)
                    .filter(addr => addr.trim())
                    .filter(addr => addr !== addressToDelete);
                
                await env.BEST_IP.put(type, addressArray.join('\n'));

                return new Response('删除成功', {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } catch (error) {
                console.error('Error deleting address:', error);
                return new Response('删除失败: ' + error.message, { 
                    status: 500,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        }
        
        // 优选IP添加的路由
        if (url.pathname === '/api/addresses' && request.method === 'POST') {
            try {
                const key = request.headers.get('Authorization');
                if (key !== env.ACCESS_KEY?.trim()) {
                    return new Response('Unauthorized', { status: 401 });
                }

                // 检查 KV 存储是否可用
                if (!env.BEST_IP) {
                    return new Response('KV storage not configured', { status: 500 });
                }

                const newAddresses = await request.json();
                const updates = {};

                for (const type of ['ADD', 'ADDNOTLS', 'ADDAPI', 'ADDNOTLSAPI']) {
                    if (newAddresses[type]) {
                        // 获取当前存储的值
                        const currentValue = await env.BEST_IP.get(type) || '';
                        const currentAddresses = currentValue.split(/[\r\n,]+/).filter(addr => addr.trim());
                        const newAddressList = newAddresses[type].split(/[\r\n,]+/).filter(addr => addr.trim());
                        
                        // 合并并去重
                        const combinedAddresses = [...new Set([...currentAddresses, ...newAddressList])];
                        
                        // 更新 KV 存储
                        updates[type] = combinedAddresses.join('\n');
                    }
                }

                await Promise.all(Object.entries(updates).map(([type, value]) => env.BEST_IP.put(type, value)));

                return new Response('添加成功', {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } catch (error) {
                console.error('Error saving addresses:', error);
                return new Response('添加失败: ' + error.message, { 
                    status: 500,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        }

        // key 验证
        const providedKey = url.searchParams.get('key');
        if (!providedKey || providedKey !== env.ACCESS_KEY?.trim()) {
            return generateLoginPage(url.origin + url.pathname);
        }

        // 路由处理
        switch (url.pathname) {
            case '/sub':
                // 初始化所有地址列表
                let currentAddresses = [];
                let currentNonTLSAddresses = [];
                let currentAPIAddresses = [];
                let currentNonTLSAPIAddresses = [];
                let csvAddresses = [];

                try {
                    // 从 KV 存储中读取数据
                    const storedADD = await env.BEST_IP.get('ADD') || '';
                    const storedADDNOTLS = await env.BEST_IP.get('ADDNOTLS') || '';
                    const storedADDAPI = await env.BEST_IP.get('ADDAPI') || '';
                    const storedADDNOTLSAPI = await env.BEST_IP.get('ADDNOTLSAPI') || '';

                    // 从存储中获取地址
                    if (storedADD) currentAddresses = await ADD(storedADD);
                    if (storedADDNOTLS) currentNonTLSAddresses = await ADD(storedADDNOTLS);
                    if (storedADDAPI) {
                        const apiUrls = await ADD(storedADDAPI);
                        currentAPIAddresses = await getAddressesapi(apiUrls);
                    }
                    if (storedADDNOTLSAPI) currentNonTLSAPIAddresses = await ADD(storedADDNOTLSAPI);

                    // 获取必要参数
                    const host = url.searchParams.get('host');
                    const uuid = url.searchParams.get('uuid');
                    const path = url.searchParams.get('path') || '/';
                    const protocol = url.searchParams.get('protocol') || 'vmess';
                    const useTLS = url.searchParams.get('tls') !== 'false';
                    const newmark = url.searchParams.get('newmark'); // 新增


                    if (!host || !uuid) {
                        return new Response('Missing required parameters', { status: 400 });
                    }

                    // 合并所有地址
                    const allAddresses = [
                        ...currentAddresses,
                        ...currentNonTLSAddresses,
                        ...currentAPIAddresses,
                        ...currentNonTLSAPIAddresses,
                        ...csvAddresses
                    ];

                    console.log('Debug - Total addresses:', allAddresses.length);

                    // 生成配置
                    const configs = allAddresses.map(address => {
                        try {
                            const [serverPart, remarkPart = ''] = address.split('#');
                            const { host: serverAddress, port } = parseAddress(serverPart);
                            const remarkPrefix = newmark ? `${newmark}-` : ''; // 新增
                            const remark = `${remarkPrefix}${remarkPart.trim() || serverAddress.trim()}`; // 修改

                            if (protocol === 'vmess') {
                                const vmessConfig = {
                                    v: "2",
                                    ps: remark,
                                    add: serverAddress,
                                    port: parseInt(port),
                                    id: uuid,  // 注意：这里应该是 id 而不是 uuid
                                    aid: 0,
                                    net: "ws",
                                    type: "none",
                                    host: host,
                                    path: path,
                                    tls: useTLS ? "tls" : "",
                                    sni: host,
                                    fp: "random"
                                };
                                return 'vmess://' + safeBase64(JSON.stringify(vmessConfig));
                            } else {
                                return `vless://${uuid}@${serverAddress}:${port}?encryption=none&security=${useTLS ? 'tls' : 'none'}&sni=${host}&fp=random&type=ws&host=${host}&path=${encodeURIComponent(path)}#${encodeURIComponent(remark)}`;
                            }
                        } catch (error) {
                            console.error('Config generation error for address:', address, error);
                            return null;
                        }
                    }).filter(Boolean);

                    return new Response(configs.join('\n'), {
                        headers: {
                            "content-type": "text/plain; charset=utf-8",
                            "Profile-Update-Interval": `${SUBUpdateTime}`,
                            "Subscription-Userinfo": `upload=0; download=0; total=${total}; expire=${timestamp}`,
                            "Content-Disposition": "attachment; filename=Sub",
                            "Profile-Title": "Subscribe",
                            "Access-Control-Allow-Origin": "*"
                        }
                    });
                } catch (error) {
                    console.error('Error generating subscription:', error);
                    return handleError(error);
                }

            case '/':
                return generateHomePage(env);

            default:
                return new Response('Not Found', { status: 404 });
        }
    }
};

// 修改错误处理，使用更安全的方式
function handleError(error) {
    // 不要输出具体错误息到控制台
    return new Response('An error occurred', { status: 500 });
}

// 在生产环境中使用安全日志函数
function secureLog(message, isError = false) {
    // 在开发环境中输出日志
    if (process.env.NODE_ENV === 'development') {
        if (isError) {
            console.error(message);
        } else {
            console.log(message);
        }
    }
}

function parseAddress(address) {
    let host, port;
    
    // 清理输入字符串
    address = address.trim();
    
    if (address.includes('[')) {
        // IPv6 地址格式：[2606:4700:3037:e1:a64b:6580:941f:e09]:80
        const match = address.match(/\[([\da-fA-F:]+)\]:(\d+)/);
        if (match) {
            host = match[1];
            port = match[2];
        } else {
            // 处理可能缺少端口的情况
            const ipMatch = address.match(/\[([\da-fA-F:]+)\]/);
            if (ipMatch) {
                host = ipMatch[1];
                port = '80'; // 默认端口
            } else {
                throw new Error('Invalid IPv6 address format');
            }
        }
    } else if (address.includes(':')) {
        // 检查是否是未被方括号包围的 IPv6 地址
        const parts = address.split(':');
        if (parts.length > 2) {
            // 这是一个未被方括号包围的 IPv6 地址
            // 假设最后一个冒号后面的是端口
            port = parts.pop();
            host = parts.join(':');
        } else {
            // IPv4 地址或域名
            [host, port] = parts;
        }
    } else {
        throw new Error('Invalid address format');
    }

    // 验证 IPv6 地址格式
    const isIPv6 = host.includes(':');
    
    // 验证端口号
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error('Invalid port number');
    }

    return { 
        host: host.trim(),
        port: port.trim(),
        isIPv6: isIPv6
    };
}

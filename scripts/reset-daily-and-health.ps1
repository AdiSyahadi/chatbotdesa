param(
    [string]$Email = 'adi.rahadi024@gmail.com',
    [int]$HealthScore = 100,
    [string]$DbContainer = 'waapi-mysql',
    [string]$DbName = 'whatsapp_saas',
    [string]$DbUser = 'root',
    [string]$DbPassword = 'root'
)

$ErrorActionPreference = 'Stop'

Write-Host "Target email: $Email"
Write-Host "Health score set to: $HealthScore"

$Sql = @"
SELECT id, email, organization_id
FROM users
WHERE email = '$Email';

START TRANSACTION;
UPDATE whatsapp_instances
SET daily_message_count = 0,
    health_score = $HealthScore
WHERE organization_id = (
    SELECT organization_id
    FROM users
    WHERE email = '$Email'
    LIMIT 1
);
SELECT ROW_COUNT() AS affected_instances;
COMMIT;

SELECT id, name, health_score, daily_message_count, daily_limit, status
FROM whatsapp_instances
WHERE organization_id = (
    SELECT organization_id
    FROM users
    WHERE email = '$Email'
    LIMIT 1
);
"@

$TempSqlFile = Join-Path $env:TEMP 'reset-daily-and-health.sql'
Set-Content -Path $TempSqlFile -Value $Sql -Encoding UTF8

try {
    docker cp $TempSqlFile "$DbContainer`:/tmp/reset-daily-and-health.sql"
    docker exec $DbContainer sh -lc "mysql -u$DbUser -p$DbPassword -D $DbName < /tmp/reset-daily-and-health.sql"
}
finally {
    if (Test-Path $TempSqlFile) {
        Remove-Item $TempSqlFile -Force
    }
    docker exec $DbContainer sh -lc "rm -f /tmp/reset-daily-and-health.sql" | Out-Null
}

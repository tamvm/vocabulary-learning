<?php
/**
 * Apply production FQDNs + public URL env from inside the Coolify container.
 * Run via: docker exec -i coolify php /tmp/coolify-apply-voca-domains.php
 * Does not print secret values.
 */
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Application;

$backendUuid = getenv('BACKEND_UUID') ?: '';
$frontendUuid = getenv('FRONTEND_UUID') ?: '';
$backendFqdn = getenv('BACKEND_FQDN') ?: '';
$frontendFqdn = getenv('FRONTEND_FQDN') ?: '';
$frontendUrl = getenv('FRONTEND_URL_VALUE') ?: '';
$viteApiUrl = getenv('VITE_API_URL_VALUE') ?: '';

if ($backendUuid === '' || $frontendUuid === '' || $backendFqdn === '' || $frontendFqdn === '') {
    fwrite(STDERR, "Missing BACKEND_UUID / FRONTEND_UUID / FQDN env\n");
    exit(1);
}

function appByUuid(string $uuid): Application
{
    $application = Application::where('uuid', $uuid)->first();
    if (!$application) {
        fwrite(STDERR, "Application not found: {$uuid}\n");
        exit(1);
    }
    return $application;
}

function upsertEnv(Application $application, string $key, string $value): void
{
    $row = $application->environment_variables()
        ->where('key', $key)
        ->where('is_preview', false)
        ->first();
    if ($row) {
        $row->value = $value;
        $row->is_literal = true;
        $row->save();
        echo "  updated env {$key}\n";
        return;
    }
    $application->environment_variables()->create([
        'key' => $key,
        'value' => $value,
        'is_literal' => true,
        'is_preview' => false,
        'is_runtime' => true,
        'is_buildtime' => true,
    ]);
    echo "  created env {$key}\n";
}

$backend = appByUuid($backendUuid);
$frontend = appByUuid($frontendUuid);

echo 'backend fqdn before=' . ($backend->fqdn ?: '<empty>') . "\n";
echo 'frontend fqdn before=' . ($frontend->fqdn ?: '<empty>') . "\n";

$backend->fqdn = $backendFqdn;
$backend->save();
$frontend->fqdn = $frontendFqdn;
$frontend->save();

echo "backend fqdn after={$backend->fqdn}\n";
echo "frontend fqdn after={$frontend->fqdn}\n";

if ($frontendUrl !== '') {
    upsertEnv($backend, 'FRONTEND_URL', $frontendUrl);
}
if ($viteApiUrl !== '') {
    upsertEnv($frontend, 'VITE_API_URL', $viteApiUrl);
}

echo "artisan apply done\n";

<?php
/**
 * contact.php — Grayson Design Partners (GDP2027)
 * Backend for the contact modal. Same battle-tested pattern as
 * jongrayson.com (php/contact-me.php), adapted for GDP fields.
 *
 * Spam defenses (layered):
 *   1. POST-only
 *   2. Referer check (blocks off-site form embedding)
 *   3. Honeypot ("website" field — bots fill it, humans never see it)
 *   4. Time-gate (must spend >=3s in the form before sending)
 *   5. Per-IP rate limit (10/hour)
 *   6. Validation + URL blocking + keyword blocklist
 *
 * Deploy to: /php/contact.php next to index.html.
 * Works on any shared host with PHP mail() (NetworkSolutions, DreamHost).
 * NOTE: FROM_EMAIL must be an address on the hosting domain.
 */

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// ── CONFIG — confirm before deploy ───────────────────────
define('TO_EMAIL',    'jon@graysondp.com');      // destination inbox
define('FROM_EMAIL',  'noreply@graysondp.com');   // must be on the hosted domain
define('FROM_NAME',   'graysondp.com Contact Form');
define('SITE_DOMAIN', 'graysondp.com');
define('RATE_LIMIT',  10);      // submissions per window per IP
define('RATE_WINDOW', 3600);    // 1 hour
define('MIN_TIME',    3);       // seconds from modal open to send
define('RATE_DIR',    sys_get_temp_dir() . '/gdp_rl/');
// ──────────────────────────────────────────────────────────

function json_error(string $msg): void {
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}
function json_ok(): void {
    echo json_encode(['success' => true]);
    exit;
}

// 1. POST ONLY
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.');

// 2. REFERER CHECK — blocks forms embedded on other sites.
//    Empty referer passes (curl, file://, privacy setups); localhost passes for local dev.
$ref = $_SERVER['HTTP_REFERER'] ?? '';
if (!empty($ref)
    && strpos($ref, SITE_DOMAIN) === false
    && strpos($ref, 'localhost') === false
    && strpos($ref, '127.0.0.1') === false) json_error('Invalid origin.');

// 3. HONEYPOT — hidden field bots fill; humans never see it.
//    Fake success so bots (and their owners) move on.
if (trim($_POST['website'] ?? '') !== '') json_ok();

// 4. TIME-GATE — the modal stamps _form_time when it opens.
//    Real humans need >= MIN_TIME seconds; scripted submits are instant.
$ft      = intval($_POST['_form_time'] ?? 0);
$elapsed = ($ft > 0) ? (time() - intval($ft / 1000)) : 999;
if ($ft > 0 && $elapsed < MIN_TIME) json_error('Submission too fast. Please try again.');

// 5. RATE LIMIT — 10 per hour per IP (file-based, no DB needed)
$ip    = preg_replace('/[^0-9a-fA-F:.]/', '', $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$rfile = RATE_DIR . md5($ip) . '.json';
if (!is_dir(RATE_DIR)) mkdir(RATE_DIR, 0700, true);
$rate = ['count' => 0, 'window_start' => time()];
if (file_exists($rfile)) {
    $raw = json_decode(file_get_contents($rfile), true);
    if ($raw && (time() - ($raw['window_start'] ?? 0)) < RATE_WINDOW) $rate = $raw;
}
if ($rate['count'] >= RATE_LIMIT) json_error('Too many submissions. Please try again in an hour.');

// 6. SANITIZE — GDP modal fields: name, email, service, message
function clean(string $v, int $max = 500): string {
    return htmlspecialchars(substr(trim(strip_tags($v)), 0, $max), ENT_QUOTES, 'UTF-8');
}
$name    = clean($_POST['name']    ?? '', 100);
$email   = filter_var(trim($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL);
$service = clean($_POST['service'] ?? '', 150);
$message = clean($_POST['message'] ?? '', 2000);

// 7. VALIDATE
if (empty($name))                                                json_error('Name is required.');
if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL))  json_error('A valid email is required.');
if (empty($message))                                             json_error('Message is required.');
if (str_word_count($message) < 3)                                json_error('Please add more detail to your message.');

// 8. SPAM CHECKS — no links in the message; keyword blocklist (fake success
//    so bots think it worked); name structure heuristics.
if (preg_match('/https?:\/\//i', $message) || preg_match('/\bwww\./i', $message))
    json_error('Message may not contain links.');
$all = strtolower("$name $service $message");
foreach (['casino','poker','viagra','cialis','crypto','bitcoin','nft','make money',
          'earn money','work from home','click here','seo service','buy followers',
          'guaranteed','prize','lottery','free money','adult','escort','xxx',
          'weight loss','fat burner','backlink','buy traffic','passive income'] as $kw) {
    if (strpos($all, $kw) !== false) json_ok();
}
if (substr_count($name, '.') > 1 || preg_match('/[<>{}|\\\\]/', $name . $message)) json_ok();

// 9. BUILD EMAIL
$div  = str_repeat('-', 52);
$subj = '=?UTF-8?B?' . base64_encode('New Inquiry: ' . $name . (!empty($service) ? ' — ' . $service : '')) . '?=';
$body = "New project inquiry\ngraysondp.com\n$div\n\n"
      . "NAME:          $name\n"
      . "EMAIL:         $email\n"
      . (!empty($service) ? "PROJECT TYPE:  $service\n" : '')
      . "\nMESSAGE:\n$div\n$message\n\n$div\n"
      . "Submitted:     " . date('Y-m-d H:i:s T') . "\n"
      . "Elapsed:       {$elapsed}s after modal open\n";

// 10. SEND — From on-domain (shared-host deliverability), Reply-To the visitor,
//     envelope sender pinned via -f so mail actually leaves the server.
$safe_name = str_replace(["\r", "\n"], '', $name);   // header-injection hardening
$headers  = 'From: ' . FROM_NAME . ' <' . FROM_EMAIL . ">\r\n";
$headers .= 'Reply-To: ' . $safe_name . ' <' . $email . ">\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: 8bit\r\n";
$headers .= 'X-Mailer: PHP/' . phpversion() . "\r\n";
$headers .= "X-Priority: 3\r\n";

$params = '-f' . FROM_EMAIL;

$sent = mail(TO_EMAIL, $subj, $body, $headers, $params);

if (!$sent) {
    error_log('[contact.php] mail() returned false for submission from: ' . $email);
    json_error('Delivery failed. Please email ' . TO_EMAIL . ' while this is resolved.');
}

// 11. RATE LIMIT INCREMENT
$rate['count']++;
file_put_contents($rfile, json_encode($rate), LOCK_EX);

json_ok();
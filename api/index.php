<?php
/*
 * Proxy MAG portal -> LBBE backend (/tv_mag). Portal zove:  api/?r=/playlist_information/<MAC>&sn=..&dt=..
 * Isti host kao portal: MAG 250/254 nema CORS ni moderan TLS problem, a radi na svakom PHP serveru
 * bez rewrite pravila. Treba PHP s curl ili allow_url_fopen.
 */
$BACKEND = 'https://app-api-v4.lbbeiptv.com/tv_mag';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$r = isset($_GET['r']) ? (string)$_GET['r'] : '';
// Samo poznate rute i MAC u putanji — proxy nije otvoren za bilo sto.
if (!preg_match('#^/(playlist_information|get_app_setting)/([0-9A-Fa-f]{2}(:|%3A)){5}[0-9A-Fa-f]{2}$#', $r)) {
    http_response_code(400);
    exit('{"error":"bad request"}');
}
$q = $_GET;
unset($q['r']);
$url = $BACKEND . str_replace('%3A', ':', $r) . ($q ? '?' . http_build_query($q) : '');

$ip = isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? $_SERVER['HTTP_CF_CONNECTING_IP'] : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
$headers = array('X-Forwarded-For: ' . $ip, 'X-Real-IP: ' . $ip, 'Accept: application/json');
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : 'MAG';

$status = 0; $body = false;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_USERAGENT => $ua,
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 25, CURLOPT_FOLLOWLOCATION => false
    ));
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $ctx = stream_context_create(array('http' => array(
        'method' => 'GET', 'header' => implode("\r\n", $headers), 'user_agent' => $ua,
        'timeout' => 25, 'ignore_errors' => true
    )));
    $body = @file_get_contents($url, false, $ctx);
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) $status = (int)$m[1];
}

if ($body === false || $status === 0) {
    http_response_code(502);
    exit('{"error":"backend unreachable"}');
}
http_response_code($status);
echo $body;

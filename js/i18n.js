/*
 * Prijevodi: svi tekstovi dolaze sa servera (playlist_information -> languages[].words),
 * isto kao WordModels na Androidu. Ovdje su samo engleski fallbackovi.
 * Kljucevi su snake_case (format web panela); t() prihvaca i camelCase varijantu.
 */
(function () {
    var EN = {
        home: 'Home', live_tv: 'Live TV', movies: 'Movies', tv_shows: 'Series', series: 'Series',
        search: 'Search', settings: 'Settings', playlists: 'Playlists', app_user_account: 'Account',
        user_account: 'Account', expiration: 'Expires', favorites: 'Favorites', recently_viewed: 'Recently viewed',
        all: 'All', uncategorized: 'Uncategorized',
        continue_watching: 'Continue watching', resume: 'Resume', play: 'Play', start_over: 'Start over',
        resume_playback_from_last_position: 'Resume playback from last position?',
        latest_movies: 'Latest movies', latest_tv_shows: 'Latest series', featured_live_tv: 'Favorite channels',
        channels: 'channels', titles: 'titles', shows: 'shows',
        select_category: 'Select a category', live_hint: 'Choose a category on the left. OK opens the player with the channel list and TV guide.',
        no_channels: 'No channels', no_movies: 'No movies', no_series: 'No series', no_episode: 'No episodes',
        no_information: 'No information', no_epg_data: 'No TV guide data', no_trailer: 'No trailer available',
        add_to_favorite: 'Add to favorites', remove_favorites: 'Remove from favorites', favorite: 'Favorite',
        catch_up: 'Catch-up', trailer: 'Trailer', watch_trailer: 'Trailer', director: 'Director', cast: 'Cast',
        genre: 'Genre', rating: 'Rating', release_date: 'Release date', length: 'Duration', season: 'Season',
        episode: 'Episode', seasons: 'Seasons', episodes: 'Episodes', up_next: 'Next', now: 'Now', next: 'Next',
        order_by_added: 'Recently added', order_by_number: 'Number', order_by_rating: 'Rating',
        sort_a_z: 'A - Z', sort_z_a: 'Z - A', string_default: 'Default', sort: 'Sort',
        general: 'General', playback: 'Playback', content: 'Content',
        change_language: 'Language', time_format: 'Time format', network_test: 'Network test',
        stream_format: 'Stream format', player_engine: 'Player engine', live_sort: 'Live sort',
        select_live_sort: 'Live channel sort', hide_live_category: 'Hide Live categories',
        hide_vod_category: 'Hide Movie categories', hide_series_category: 'Hide Series categories',
        parent_control: 'Parental control', select_categories_you_want_to_hide: 'Select categories you want to hide',
        select_all: 'Select all', hidden: 'hidden', format_12_hour: '12 hours', format_24_hour: '24 hours',
        ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No', back: 'Back', close: 'Close', retry: 'Retry',
        exit_app: 'Do you want to exit the app?', exit: 'Exit', 'continue': 'Continue',
        old_password: 'Current PIN', new_password: 'New PIN', confirm_password: 'Confirm new PIN',
        parent_password: 'Enter PIN', pin_incorrect: 'Incorrect PIN', pin_changed: 'PIN changed',
        pin_mismatch: 'PINs do not match', pin_default_hint: 'Default PIN is 0000',
        mac_address: 'MAC address', your_mac_address: 'Your MAC address',
        app_account_state: 'Subscription', account_state_active: 'Active', account_state_trial: 'Trial',
        account_state_demo: 'Demo', account_state_expired: 'Expired',
        account_expiration_date: 'App subscription expires', list_expiration_date: 'Playlist expires',
        application_version: 'Version', unlimited: 'Unlimited',
        scan_qr: 'Scan the QR code with your phone', manage_playlists: 'Manage playlists on the web',
        add_playlist: 'Add playlist', reload_playlist: 'Reload', app_reload: 'Reload',
        would_you_like_to_reload_playlist: 'Reload the playlist now?', change_playlist: 'Change playlist',
        select_playlist: 'Select playlist', active: 'Active', playlist: 'Playlist',
        add_playlist_dialog_message: 'Open lbbeiptv.com/mylist on your phone (scan the QR code) to add or edit your playlists, then press Reload.',
        mac_not_registered: 'Your device is not registered yet. Scan the QR code to activate it and start a free trial.',
        trial_ended: 'Your trial period has ended. Scan the QR code to activate a paid plan.',
        account_ended: 'Your subscription has expired. Scan the QR code to extend it.',
        no_playlist: 'No playlist added yet. Scan the QR code to add your playlist, then press Reload.',
        activate_device: 'Activate device', subscription_expired: 'Subscription expired', add_your_playlist: 'Add your playlist',
        error_network: 'Network error. Check your internet connection.',
        error_playlist_not_found: 'The playlist does not exist or has expired.',
        error_server_access_denied: 'Access denied. Check the playlist credentials.',
        error_invalid_playlist: 'The playlist is empty or invalid.',
        error_parsing_response_data: 'The server returned invalid data.',
        error_generic: 'Something went wrong.', loading_failed: 'Loading failed',
        connecting: 'Connecting...', loading: 'Loading...', loading_live: 'Loading live channels',
        loading_movies: 'Loading movies...', loading_series: 'Loading series', preparing: 'Preparing...',
        public_ip_address: 'Public IP', local_ip_address: 'Local IP', connection_type: 'Connection',
        device_info: 'Device', ping: 'Ping', download_speed: 'Download', upload_speed: 'Upload',
        start_speed_test: 'Start test', testing_ping: 'Testing ping...', testing_download: 'Testing download...',
        testing_upload: 'Testing upload...', dns: 'DNS', system: 'System', model: 'Model', platform: 'Platform',
        audio_track: 'Audio', subtitles: 'Subtitles', no_subtitles: 'Off', screen_ratio: 'Aspect ratio',
        ratio_zoom: 'Zoom', ratio_fit: 'Fit (whole image)', ratio_stretch: 'Stretch', ratio_auto: 'Auto',
        stream_error: 'This stream cannot be played right now.', stream_retry: 'OK = retry  ·  BACK = close',
        search_hint: 'Type to search', results: 'results', search_in: 'Search in',
        locked: 'Locked', next_episode: 'Next episode', episode_short: 'E', season_short: 'S',
        live: 'LIVE', archive: 'ARCHIVE', catchup_hint: 'RIGHT = catch-up', ok_full: 'OK = full screen',
        press_ok_to_play: 'OK = play', today: 'Today', yesterday: 'Yesterday',
        loading_connecting: 'Connecting to LBBE server', loading_signing_in: 'Signing in to playlist',
        loading_live_categories: 'Loading live categories', loading_vod_categories: 'Loading movie categories',
        loading_series_categories: 'Loading series categories', loading_vod: 'Loading movies',
        loading_download: 'Downloading playlist', loading_processing: 'Preparing channels, movies and series',
        loading_starting: 'Starting', loading_step: 'Step %1 of %2', error: 'Error',
        action_start: 'Start', activation_scan: 'Scan with your phone', days_left: '%1 days left',
        osd_audio: 'Audio', osd_subtitles: 'Subtitles', osd_ratio: 'Picture size', osd_info: 'Info',
        osd_episodes: 'Episodes', osd_previous: 'Previous', osd_next_item: 'Next', osd_episode_of: 'Episode %1 of %2',
        ratio_safe_fill: 'Fill screen', ratio_16_9: '16:9', ratio_4_3: '4:3', picture: 'Picture',
        play_reconnecting: 'Reconnecting\u2026 (%1/%2)', play_error_title: 'Can\'t play this channel',
        play_error_vod_title: 'Can\'t play this video',
        play_error_network_msg: 'The stream is not reachable. Check your connection or try again in a moment.',
        play_error_vod_hint: 'Press Back to return.'
    };

    var current = {};
    var languages = [];

    function camel(k) { return k.replace(/_([a-z0-9])/g, function (m, c) { return c.toUpperCase(); }); }
    function snake(k) { return k.replace(/([A-Z])/g, function (m, c) { return '_' + c.toLowerCase(); }); }

    var I18N = App.I18N = {
        setLanguages: function (list) {
            languages = U.toArray(list).filter(function (l) { return l && l.code; });
        },
        languages: function () { return languages; },
        setLang: function (code) {
            current = {};
            for (var i = 0; i < languages.length; i++) {
                if (languages[i].code === code) {
                    current = languages[i].words || {};
                    break;
                }
            }
        },
        langName: function (code) {
            for (var i = 0; i < languages.length; i++) if (languages[i].code === code) return languages[i].name || code;
            return code === 'en' ? 'English' : (code || 'English');
        }
    };

    /** t('live_tv') -> prijevod sa servera, inace engleski. */
    window.t = App.t = function (key, fallback) {
        var v = current[key];
        if (v === undefined || v === null || v === '') v = current[camel(key)];
        if (v === undefined || v === null || v === '') v = current[snake(key)];
        if (v === undefined || v === null || v === '') v = EN[key];
        if (v === undefined || v === null) v = fallback !== undefined ? fallback : key;
        return String(v);
    };
})();

vcl 4.1;

backend default {
    .host = "127.0.0.1";
    .port = "3001";
}

acl local {
    "127.0.0.1";
}

sub vcl_recv {
    # Local-only test control, never deploy this purge endpoint publicly.
    if (req.method == "PURGE") {
        if (client.ip !~ local) {
            return (synth(403));
        }
        if (!req.http.X-Purge-Key) {
            return (purge);
        }
        if (req.http.X-Purge-Key !~ "^[a-zA-Z0-9_.-]+$") {
            return (synth(403));
        }
        ban("obj.http.Surrogate-Key ~ " + req.http.X-Purge-Key);
        return (synth(200, "Purged"));
    }
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }
    if (req.http.Authorization || req.http.Range || req.http.X-Tsr-Redirect || req.url ~ "[?]") {
        return (pass);
    }
    if (req.http.Cookie) {
        if (req.http.Cookie ~ "^NEXT_LOCALE=[a-zA-Z-]+$" &&
            req.url ~ "^/(en|en-GB|de|fr|nb-NO|tr|fi|id|pl|pt-BR|it|ru|si|vi|ar|es|ja|cs|zh-Hans|bg|uk|et|ca|el|ta|fa|hi|bn|eo|lt|hr|be|hu|nl|pt|zh-Hant|oc|da|az|he|ro|hy|ko|sv|pa|sq|ia|ckb|ga|kab|fil|br|gl|kw|eu|sk)(/|$)") {
            unset req.http.Cookie;
        } else {
            return (pass);
        }
    }
}

sub vcl_backend_response {
    if (beresp.status != 200 || beresp.http.Set-Cookie ||
        beresp.http.Cache-Control !~ "public" ||
        beresp.http.Cache-Control ~ "private|no-store") {
        set beresp.uncacheable = true;
        set beresp.ttl = 0s;
        return (deliver);
    }
}

sub vcl_deliver {
    if (obj.uncacheable) {
        set resp.http.X-Edge-Cache = "BYPASS";
    } else if (obj.hits > 0) {
        set resp.http.X-Edge-Cache = "HIT";
    } else {
        set resp.http.X-Edge-Cache = "MISS";
    }
}

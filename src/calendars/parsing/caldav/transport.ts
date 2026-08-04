import { request } from "obsidian";
import * as dav from "dav";

/**
 * A `dav` transport that talks through Obsidian's request API.
 *
 * The dav library drives every request through an XMLHttpRequest-shaped object:
 * on the way out it installs headers with `setRequestHeader`, on the way back it
 * reads `responseText`. A real XHR issued from the renderer would be blocked by
 * CORS against most CalDAV servers, so dav is handed a stand-in exposing exactly
 * that surface while the actual fetching is done by Obsidian's `request()`,
 * which is not subject to the browser's origin rules.
 */

/** The slice of XMLHttpRequest that the dav library actually touches. */
class XhrStandin {
    readonly headers: Record<string, string> = {};
    responseText = "";
    status = 0;

    setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
    }

    getResponseHeader(): string | null {
        return null;
    }
}

const basicAuthHeader = (username: string, password: string): string =>
    `Basic ${btoa(`${username}:${password}`)}`;

export class Basic extends dav.transport.Transport {
    private readonly username: string;
    private readonly password: string;

    constructor(credentials: dav.Credentials) {
        super(credentials);
        this.username = credentials.username ?? "";
        this.password = credentials.password ?? "";
    }

    async send(
        req: dav.Request,
        url: string,
        _options?: dav.transport.TransportOptions
    ): Promise<any> {
        const xhr = new XhrStandin();

        // Let dav install whatever headers this request needs (Depth,
        // Content-Type, …) before we take over and actually send it.
        req.transformRequest?.(xhr);

        try {
            xhr.responseText = await request({
                url,
                method: req.method,
                headers: {
                    ...xhr.headers,
                    Authorization: basicAuthHeader(
                        this.username,
                        this.password
                    ),
                },
                body: req.requestData,
            });
            xhr.status = 200;
        } catch (e) {
            req.onerror?.(e instanceof Error ? e : new Error(String(e)));
            throw e;
        }

        return req.transformResponse ? req.transformResponse(xhr) : xhr;
    }
}

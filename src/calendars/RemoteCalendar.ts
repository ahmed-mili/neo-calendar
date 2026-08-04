import { Calendar } from "./Calendar";

/**
 * A read-only calendar whose events are fetched from a remote source and held
 * in a local cache. Callers refresh that cache by awaiting `revalidate()`;
 * `getEvents()` then returns whatever was last fetched.
 */
export default abstract class RemoteCalendar extends Calendar {
    abstract revalidate(): Promise<void>;
}

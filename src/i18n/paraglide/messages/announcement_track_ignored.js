/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ title: NonNullable<unknown> }} Announcement_Track_IgnoredInputs */

const uk_announcement_track_ignored = /** @type {(inputs: Announcement_Track_IgnoredInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Трек ігноровано: ${i?.title}`)
};

const en_announcement_track_ignored = /** @type {(inputs: Announcement_Track_IgnoredInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Track ignored: ${i?.title}`)
};

/**
* | output |
* | --- |
* | "Track ignored: {title}" |
*
* @param {Announcement_Track_IgnoredInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const announcement_track_ignored = /** @type {((inputs: Announcement_Track_IgnoredInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Announcement_Track_IgnoredInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_announcement_track_ignored(inputs)
	return en_announcement_track_ignored(inputs)
});
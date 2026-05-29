/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_TrackInputs */

const uk_segment_track = /** @type {(inputs: Segment_TrackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Трек`)
};

const en_segment_track = /** @type {(inputs: Segment_TrackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Track`)
};

/**
* | output |
* | --- |
* | "Track" |
*
* @param {Segment_TrackInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_track = /** @type {((inputs?: Segment_TrackInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_TrackInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_track(inputs)
	return en_segment_track(inputs)
});
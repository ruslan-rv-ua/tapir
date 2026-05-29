/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Incomplete_BadgeInputs */

const uk_songs_incomplete_badge = /** @type {(inputs: Songs_Incomplete_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`незавершений`)
};

const en_songs_incomplete_badge = /** @type {(inputs: Songs_Incomplete_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`incomplete`)
};

/**
* | output |
* | --- |
* | "incomplete" |
*
* @param {Songs_Incomplete_BadgeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_incomplete_badge = /** @type {((inputs?: Songs_Incomplete_BadgeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Incomplete_BadgeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_incomplete_badge(inputs)
	return en_songs_incomplete_badge(inputs)
});
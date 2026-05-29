/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_SectionInputs */

const uk_songs_section = /** @type {(inputs: Songs_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Збережені пісні`)
};

const en_songs_section = /** @type {(inputs: Songs_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Saved Songs`)
};

/**
* | output |
* | --- |
* | "Saved Songs" |
*
* @param {Songs_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_section = /** @type {((inputs?: Songs_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_section(inputs)
	return en_songs_section(inputs)
});
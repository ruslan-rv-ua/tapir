/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_EmptyInputs */

const uk_songs_empty = /** @type {(inputs: Songs_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Поки що немає записаних пісень`)
};

const en_songs_empty = /** @type {(inputs: Songs_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No recorded songs yet`)
};

/**
* | output |
* | --- |
* | "No recorded songs yet" |
*
* @param {Songs_EmptyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_empty = /** @type {((inputs?: Songs_EmptyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_EmptyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_empty(inputs)
	return en_songs_empty(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Streams_EmptyInputs */

const uk_zone_streams_empty = /** @type {(inputs: Zone_Streams_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Потоки відсутні`)
};

const en_zone_streams_empty = /** @type {(inputs: Zone_Streams_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams`)
};

/**
* | output |
* | --- |
* | "No streams" |
*
* @param {Zone_Streams_EmptyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_streams_empty = /** @type {((inputs?: Zone_Streams_EmptyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Streams_EmptyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_streams_empty(inputs)
	return en_zone_streams_empty(inputs)
});
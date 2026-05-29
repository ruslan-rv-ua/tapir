/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Streams_ListInputs */

const uk_zone_streams_list = /** @type {(inputs: Zone_Streams_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список потоків`)
};

const en_zone_streams_list = /** @type {(inputs: Zone_Streams_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Streams list`)
};

/**
* | output |
* | --- |
* | "Streams list" |
*
* @param {Zone_Streams_ListInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_streams_list = /** @type {((inputs?: Zone_Streams_ListInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Streams_ListInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_streams_list(inputs)
	return en_zone_streams_list(inputs)
});
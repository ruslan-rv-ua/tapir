/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Streams_ToolbarInputs */

const uk_zone_streams_toolbar = /** @type {(inputs: Zone_Streams_ToolbarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пошук і фільтри`)
};

const en_zone_streams_toolbar = /** @type {(inputs: Zone_Streams_ToolbarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Search and filters`)
};

/**
* | output |
* | --- |
* | "Search and filters" |
*
* @param {Zone_Streams_ToolbarInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_streams_toolbar = /** @type {((inputs?: Zone_Streams_ToolbarInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Streams_ToolbarInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_streams_toolbar(inputs)
	return en_zone_streams_toolbar(inputs)
});
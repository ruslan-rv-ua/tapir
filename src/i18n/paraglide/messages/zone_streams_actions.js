/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Streams_ActionsInputs */

const uk_zone_streams_actions = /** @type {(inputs: Zone_Streams_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії потоку`)
};

const en_zone_streams_actions = /** @type {(inputs: Zone_Streams_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream actions`)
};

/**
* | output |
* | --- |
* | "Stream actions" |
*
* @param {Zone_Streams_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_streams_actions = /** @type {((inputs?: Zone_Streams_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Streams_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_streams_actions(inputs)
	return en_zone_streams_actions(inputs)
});
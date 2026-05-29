/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Activity_BarInputs */

const uk_zone_activity_bar = /** @type {(inputs: Zone_Activity_BarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Бокова панель`)
};

const en_zone_activity_bar = /** @type {(inputs: Zone_Activity_BarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Sidebar`)
};

/**
* | output |
* | --- |
* | "Sidebar" |
*
* @param {Zone_Activity_BarInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_activity_bar = /** @type {((inputs?: Zone_Activity_BarInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Activity_BarInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_activity_bar(inputs)
	return en_zone_activity_bar(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Metric_Active_RecordingsInputs */

const uk_metric_active_recordings = /** @type {(inputs: Metric_Active_RecordingsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Активні`)
};

const en_metric_active_recordings = /** @type {(inputs: Metric_Active_RecordingsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Active`)
};

/**
* | output |
* | --- |
* | "Active" |
*
* @param {Metric_Active_RecordingsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const metric_active_recordings = /** @type {((inputs?: Metric_Active_RecordingsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Metric_Active_RecordingsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_metric_active_recordings(inputs)
	return en_metric_active_recordings(inputs)
});
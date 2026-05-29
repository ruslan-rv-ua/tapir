/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_Recording_LabelInputs */

const uk_status_recording_label = /** @type {(inputs: Status_Recording_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Записується`)
};

const en_status_recording_label = /** @type {(inputs: Status_Recording_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording`)
};

/**
* | output |
* | --- |
* | "Recording" |
*
* @param {Status_Recording_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_recording_label = /** @type {((inputs?: Status_Recording_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_Recording_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_recording_label(inputs)
	return en_status_recording_label(inputs)
});